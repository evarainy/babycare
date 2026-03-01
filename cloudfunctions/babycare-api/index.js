const cloud = require('wx-server-sdk')
const dayjs = require('dayjs')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const recordsCollection = db.collection('feeding_records')
const usersCollection = db.collection('users')
const babiesCollection = db.collection('babies')

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || event.openid || ''

  try {
    switch (action) {
      case 'addRecord':
        return await addRecord(event, openid)
      case 'getRecords':
        return await getRecords(event, openid)
      case 'updateRecord':
        return await updateRecord(event, openid)
      case 'deleteRecord':
        return await deleteRecord(event, openid)
      case 'getReport':
        return await getReport(event, openid)
      case 'getTodaySummary':
        return await getTodaySummary(event, openid)
      case 'bindFamily':
        return await bindFamily(event, openid)
      case 'getFamilyMembers':
        return await getFamilyMembers(event, openid)
      case 'getUserInfo':
        return await getUserInfo(event, openid)
      case 'updateUserInfo':
        return await updateUserInfo(event, openid)
      case 'listBabies':
        return await listBabies(event, openid)
      case 'saveBaby':
        return await saveBaby(event, openid)
      case 'setCurrentBaby':
        return await setCurrentBaby(event, openid)
      case 'deleteBaby':
        return await deleteBaby(event, openid)
      case 'generateBotBindCode':
        return await generateBotBindCode(event, openid)
      case '_sendBotMessage':
        return await sendBotMessage(event)
      case 'siriRecord':
        return await siriRecord(event)
      default:
        return { code: 400, message: '未知操作' }
    }
  } catch (err) {
    console.error('babycare-api error:', err)
    return { code: 500, message: '服务器错误', error: err.message }
  }
}

async function addRecord(event, openid) {
  const { record } = event
  const familyId = await getFamilyId(openid)
  const { currentBabyId } = await getCurrentBaby(openid)

  const newRecord = {
    familyId,
    openid,
    babyId: currentBabyId || '',
    type: record.type || 'bottle',
    amount: toNullable(record.amount),
    side: toNullable(record.side),
    feedingType: toNullable(record.feedingType),
    duration: toNullable(record.duration),
    note: record.note || '',
    recordTime: record.recordTime ? new Date(record.recordTime) : new Date(),
    source: record.source || 'miniprogram',
    status: 'confirmed',
    createTime: new Date(),
    updateTime: new Date()
  }

  const result = await recordsCollection.add({ data: newRecord })
  return { code: 0, message: '记录成功', id: result._id, record: newRecord }
}

async function getRecords(event, openid) {
  const { date, limit = 50, skip = 0 } = event
  const familyId = await getFamilyId(openid)
  const { currentBabyId } = await getCurrentBaby(openid)

  let query = recordsCollection.where({ familyId, status: _.neq('deleted') })

  if (date) {
    const { start, end } = getChinaDayRange(date)
    query = recordsCollection.where({
      familyId,
      status: _.neq('deleted'),
      recordTime: _.gte(start).and(_.lte(end))
    })
  }

  const result = await query
    .orderBy('recordTime', 'desc')
    .skip(skip)
    .limit(limit)
    .get()

  const scopedRecords = (result.data || []).filter(r => isRecordMatchCurrentBaby(r, currentBabyId))
  return { code: 0, data: scopedRecords, count: scopedRecords.length }
}

async function updateRecord(event, openid) {
  const { id, record } = event
  const familyId = await getFamilyId(openid)

  const existing = await recordsCollection.doc(id).get()
  if (existing.data.familyId !== familyId) {
    return { code: 403, message: '无权限修改此记录' }
  }

  const updateData = {
    ...record,
    updateTime: new Date(),
    status: 'confirmed'
  }
  delete updateData._id
  delete updateData.familyId
  delete updateData.openid
  delete updateData.babyId

  await recordsCollection.doc(id).update({ data: updateData })
  return { code: 0, message: '更新成功' }
}

async function deleteRecord(event, openid) {
  const { id } = event
  const familyId = await getFamilyId(openid)

  const existing = await recordsCollection.doc(id).get()
  if (existing.data.familyId !== familyId) {
    return { code: 403, message: '无权限删除此记录' }
  }

  await recordsCollection.doc(id).update({
    data: { status: 'deleted', updateTime: new Date() }
  })
  return { code: 0, message: '删除成功' }
}

async function getReport(event, openid) {
  const { startDate, endDate, type = 'daily' } = event
  const familyId = await getFamilyId(openid)
  const { currentBabyId } = await getCurrentBaby(openid)

  const { start } = getChinaDayRange(startDate)
  const { end } = getChinaDayRange(endDate)

  const result = await recordsCollection
    .where({
      familyId,
      status: _.neq('deleted'),
      recordTime: _.gte(start).and(_.lte(end))
    })
    .orderBy('recordTime', 'asc')
    .get()

  const records = (result.data || []).filter(r => isRecordMatchCurrentBaby(r, currentBabyId))
  const report = generateReport(records, type, startDate, endDate)

  return { code: 0, data: report }
}

async function getTodaySummary(event, openid) {
  const familyId = await getFamilyId(openid)
  const { currentBabyId, currentBaby } = await getCurrentBaby(openid)
  const { start, end } = getChinaDayRange()

  const result = await recordsCollection
    .where({
      familyId,
      status: _.neq('deleted'),
      recordTime: _.gte(start).and(_.lte(end))
    })
    .orderBy('recordTime', 'desc')
    .get()

  const records = (result.data || []).filter(r => isRecordMatchCurrentBaby(r, currentBabyId))
  const feedingRecords = records.filter(r => r.type === 'breastfeeding' || r.type === 'bottle')
  const totalAmount = feedingRecords.reduce((sum, r) => sum + (r.amount || 0), 0)
  const lastRecord = feedingRecords[0] || null

  const formulaAmount = feedingRecords
    .filter(r => r.feedingType === '奶粉')
    .reduce((sum, r) => sum + (r.amount || 0), 0)
  const breastMilkAmount = feedingRecords
    .filter(r => r.feedingType === '母乳')
    .reduce((sum, r) => sum + (r.amount || 0), 0)

  const foodRecords = records.filter(r => r.type === 'food')
  const foodAmount = foodRecords.reduce((sum, r) => sum + (r.amount || 0), 0)

  let intervalMinutes = null
  if (lastRecord) {
    intervalMinutes = Math.floor((Date.now() - new Date(lastRecord.recordTime).getTime()) / 60000)
  }

  return {
    code: 0,
    data: {
      todayCount: feedingRecords.length,
      totalAmount,
      formulaAmount,
      breastMilkAmount,
      foodAmount,
      foodCount: foodRecords.length,
      lastRecord,
      intervalMinutes,
      allRecords: records,
      currentBaby
    }
  }
}

async function bindFamily(event, openid) {
  const { inviteCode, refreshInvite } = event
  const selfUser = await ensureUser(openid)

  if (inviteCode) {
    const targetFamily = await usersCollection
      .where({ inviteCode })
      .limit(1)
      .get()

    if (targetFamily.data.length === 0) {
      return { code: 404, message: '邀请码无效' }
    }

    const familyId = targetFamily.data[0].familyId
    await usersCollection.doc(selfUser._id).update({
      data: { familyId, updateTime: new Date() }
    })
    return { code: 0, message: '加入家庭成功', familyId }
  }

  const user = selfUser
  if (user.inviteCode && !refreshInvite) {
    return { code: 0, inviteCode: user.inviteCode, familyId: user.familyId }
  }

  const newInviteCode = generateInviteCode()
  await usersCollection.doc(user._id).update({
    data: { inviteCode: newInviteCode, updateTime: new Date() }
  })

  return { code: 0, inviteCode: newInviteCode, familyId: user.familyId }
}

async function getFamilyMembers(event, openid) {
  const familyId = await getFamilyId(openid)
  const result = await usersCollection.where({ familyId }).get()
  return { code: 0, data: result.data.map(u => ({ openid: u.openid, nickName: u.nickName, avatarUrl: u.avatarUrl, role: u.role || '其他' })) }
}

async function getUserInfo(event, openid) {
  const user = await ensureUser(openid)
  const babiesRes = await listBabies({}, openid)
  return {
    code: 0,
    data: {
      ...user,
      babies: babiesRes.data.babies,
      currentBabyId: babiesRes.data.currentBabyId
    }
  }
}

async function updateUserInfo(event, openid) {
  const { userInfo } = event
  const user = await ensureUser(openid)
  await usersCollection.doc(user._id).update({
    data: {
      nickName: userInfo.nickName || user.nickName || '宝宝家长',
      avatarUrl: userInfo.avatarUrl || user.avatarUrl || '',
      role: userInfo.role || user.role || '其他',
      updateTime: new Date()
    }
  })
  return { code: 0, message: '更新成功' }
}

async function getFamilyId(openid) {
  const user = await ensureUser(openid)
  if (user.familyId) return user.familyId

  const familyId = `family_${user.openid}_${Date.now()}`
  await usersCollection.doc(user._id).update({
    data: { familyId, updateTime: new Date() }
  })
  return familyId
}

async function ensureUser(openid) {
  if (!openid) {
    throw new Error('缺少用户标识OPENID')
  }

  const result = await usersCollection.where({ openid }).limit(1).get()
  if (result.data.length > 0) {
    return result.data[0]
  }

  const familyId = `family_${openid}_${Date.now()}`
  const newUser = {
    openid,
    familyId,
    nickName: '宝宝家长',
    avatarUrl: '',
    inviteCode: generateInviteCode(),
    role: '其他',
    createTime: new Date(),
    updateTime: new Date()
  }
  await usersCollection.add({ data: newUser })
  const created = await usersCollection.where({ openid }).limit(1).get()
  return created.data[0] || newUser
}

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

function parseNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toNullable(value) {
  return (value === undefined || value === null) ? null : value
}


async function ensureUserBySiriId(userId) {
  const result = await usersCollection.where({ siriUserId: userId }).limit(1).get()
  if (result.data.length > 0) {
    return result.data[0]
  }

  const pseudoOpenid = `siri_${userId}`
  const familyId = `family_${pseudoOpenid}_${Date.now()}`
  const newUser = {
    openid: pseudoOpenid,
    siriUserId: userId,
    familyId,
    nickName: 'Siri用户',
    avatarUrl: '',
    inviteCode: generateInviteCode(),
    role: '其他',
    createTime: new Date(),
    updateTime: new Date()
  }
  await usersCollection.add({ data: newUser })
  const created = await usersCollection.where({ siriUserId: userId }).limit(1).get()
  return created.data[0] || newUser
}

function isRecordMatchCurrentBaby(record, currentBabyId) {
  const recordBabyId = record && record.babyId
  if (!currentBabyId) return true
  return !recordBabyId || recordBabyId === currentBabyId
}


function getChinaDayRange(dateInput) {
  const base = dateInput ? dayjs(dateInput).toDate() : new Date()
  const utcTs = base.getTime()
  const chinaTs = utcTs + 8 * 60 * 60 * 1000
  const chinaDate = new Date(chinaTs)

  const y = chinaDate.getUTCFullYear()
  const m = chinaDate.getUTCMonth()
  const d = chinaDate.getUTCDate()

  const startUtcTs = Date.UTC(y, m, d, 0, 0, 0, 0) - 8 * 60 * 60 * 1000
  const endUtcTs = startUtcTs + 24 * 60 * 60 * 1000 - 1

  return { start: new Date(startUtcTs), end: new Date(endUtcTs) }
}

function parseSiriRecordTime(recordTimeText, baseDate = new Date()) {
  if (!recordTimeText || typeof recordTimeText !== 'string') {
    return new Date()
  }

  const m = recordTimeText.match(/^(\d{1,2}):(\d{1,2})$/)
  if (!m) {
    const dt = new Date(recordTimeText)
    return Number.isNaN(dt.getTime()) ? new Date() : dt
  }

  const h = Math.min(23, Math.max(0, Number(m[1])))
  const min = Math.min(59, Math.max(0, Number(m[2])))
  const d = new Date(baseDate)
  d.setHours(h, min, 0, 0)
  return d
}

function generateReport(records, type, startDate, endDate) {
  const feedingRecords = records.filter(r => r.type === 'breastfeeding' || r.type === 'bottle')
  const grouped = {}

  feedingRecords.forEach(r => {
    const key = dayjs(r.recordTime).format('YYYY-MM-DD')
    if (!grouped[key]) {
      grouped[key] = { date: key, records: [], totalAmount: 0, count: 0 }
    }
    grouped[key].records.push(r)
    grouped[key].totalAmount += r.amount || 0
    grouped[key].count += 1
  })

  const days = []
  let current = dayjs(startDate)
  const end = dayjs(endDate)
  while (current.isBefore(end) || current.isSame(end, 'day')) {
    const key = current.format('YYYY-MM-DD')
    days.push(grouped[key] || { date: key, records: [], totalAmount: 0, count: 0 })
    current = current.add(1, 'day')
  }

  const totalAmount = feedingRecords.reduce((sum, r) => sum + (r.amount || 0), 0)
  const avgDailyAmount = days.length > 0 ? Math.round(totalAmount / days.length) : 0
  const avgDailyCount = days.length > 0 ? (feedingRecords.length / days.length).toFixed(1) : 0

  const intervals = []
  for (let i = 1; i < feedingRecords.length; i++) {
    const prev = new Date(feedingRecords[i - 1].recordTime).getTime()
    const curr = new Date(feedingRecords[i].recordTime).getTime()
    intervals.push(Math.abs(prev - curr) / 60000)
  }
  const avgInterval = intervals.length > 0
    ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
    : null

  return {
    days,
    summary: {
      totalAmount,
      avgDailyAmount,
      avgDailyCount: parseFloat(avgDailyCount),
      avgIntervalMinutes: avgInterval,
      totalCount: feedingRecords.length
    }
  }
}


async function attachBabyPhotoViewUrls(babies = []) {
  const fileIDs = babies
    .map((b) => (b && typeof b.photoUrl === 'string') ? b.photoUrl : '')
    .filter((u) => u.startsWith('cloud://'))

  if (!fileIDs.length) {
    return babies.map((b) => ({ ...b, photoViewUrl: b.photoUrl || '' }))
  }

  const tempRes = await cloud.getTempFileURL({ fileList: fileIDs })
  const list = (tempRes && tempRes.fileList) || []
  const map = {}
  list.forEach((item) => {
    if (item && item.fileID) {
      map[item.fileID] = item.tempFileURL || ''
    }
  })

  return babies.map((b) => ({
    ...b,
    photoViewUrl: (b.photoUrl && b.photoUrl.startsWith('cloud://')) ? (map[b.photoUrl] || '') : (b.photoUrl || '')
  }))
}

async function listBabies(event, openid) {
  const familyId = await getFamilyId(openid)
  const user = await ensureUser(openid)

  const result = await babiesCollection
    .where({ familyId, status: _.neq('deleted') })
    .orderBy('createTime', 'asc')
    .get()

  const babies = result.data || []
  let currentBabyId = user.currentBabyId || ''

  if (!babies.length) {
    const defaultBaby = {
      familyId,
      name: '未设置宝宝',
      birthday: '',
      weightG: null,
      heightCm: null,
      photoUrl: '',
      status: 'active',
      createTime: new Date(),
      updateTime: new Date()
    }
    const addRes = await babiesCollection.add({ data: defaultBaby })
    defaultBaby._id = addRes._id
    babies.push(defaultBaby)
    currentBabyId = addRes._id
    await usersCollection.doc(user._id).update({
      data: { currentBabyId, updateTime: new Date() }
    })
  }

  if (!currentBabyId || !babies.some((b) => b._id === currentBabyId)) {
    currentBabyId = babies[0]._id
    await usersCollection.doc(user._id).update({
      data: { currentBabyId, updateTime: new Date() }
    })
  }

  const babiesWithViewUrl = await attachBabyPhotoViewUrls(babies)
  return { code: 0, data: { babies: babiesWithViewUrl, currentBabyId } }
}

async function setCurrentBaby(event, openid) {
  const { babyId } = event
  if (!babyId) return { code: 400, message: '缺少babyId' }

  const familyId = await getFamilyId(openid)
  const user = await ensureUser(openid)
  const baby = await babiesCollection.doc(babyId).get()
  if (!baby.data || baby.data.familyId !== familyId || baby.data.status === 'deleted') {
    return { code: 403, message: '无权限切换该宝宝' }
  }

  await usersCollection.doc(user._id).update({ data: { currentBabyId: babyId, updateTime: new Date() } })
  return { code: 0, message: '切换成功', data: { currentBabyId: babyId } }
}

async function saveBaby(event, openid) {
  const { baby } = event
  if (!baby || !baby.name) return { code: 400, message: '宝宝姓名不能为空' }

  const familyId = await getFamilyId(openid)
  const user = await ensureUser(openid)
  const payload = {
    name: String(baby.name || '').trim(),
    birthday: baby.birthday || dayjs().format('YYYY-MM-DD'),
    weightG: parseNumberOrNull(baby.weightG),
    heightCm: parseNumberOrNull(baby.heightCm),
    photoUrl: baby.photoUrl || '',
    updateTime: new Date()
  }

  if (baby._id) {
    const old = await babiesCollection.doc(baby._id).get()
    if (!old.data || old.data.familyId !== familyId) return { code: 403, message: '无权限更新该宝宝' }
    await babiesCollection.doc(baby._id).update({ data: payload })
    return { code: 0, message: '更新成功', data: { ...old.data, ...payload, _id: baby._id } }
  }

  const data = {
    ...payload,
    familyId,
    status: 'active',
    createTime: new Date()
  }
  const addRes = await babiesCollection.add({ data })

  if (!user.currentBabyId) {
    await usersCollection.doc(user._id).update({
      data: { currentBabyId: addRes._id, updateTime: new Date() }
    })
  }

  return { code: 0, message: '添加成功', data: { ...data, _id: addRes._id } }
}


async function deleteBaby(event, openid) {
  const { babyId } = event
  if (!babyId) return { code: 400, message: '缺少babyId' }

  const familyId = await getFamilyId(openid)
  const user = await ensureUser(openid)

  const target = await babiesCollection.doc(babyId).get()
  if (!target.data || target.data.familyId !== familyId || target.data.status === 'deleted') {
    return { code: 403, message: '无权限删除该宝宝' }
  }

  const activeBabiesRes = await babiesCollection
    .where({ familyId, status: _.neq('deleted') })
    .orderBy('createTime', 'asc')
    .get()
  const activeBabies = activeBabiesRes.data || []
  if (activeBabies.length <= 1) {
    return { code: 400, message: '至少保留一个宝宝档案' }
  }

  await babiesCollection.doc(babyId).update({
    data: { status: 'deleted', updateTime: new Date() }
  })

  const remaining = activeBabies.filter((b) => b._id !== babyId)
  const nextBabyId = (remaining[0] && remaining[0]._id) ? remaining[0]._id : ''

  if (user.currentBabyId === babyId && nextBabyId) {
    await usersCollection.doc(user._id).update({
      data: { currentBabyId: nextBabyId, updateTime: new Date() }
    })
  }

  return { code: 0, message: '删除成功', data: { currentBabyId: nextBabyId } }
}

async function getCurrentBaby(openid) {
  const babiesRes = await listBabies({}, openid)
  const babies = babiesRes.data.babies
  const currentBabyId = babiesRes.data.currentBabyId
  const currentBaby = babies.find((b) => b._id === currentBabyId) || babies[0] || null
  return { currentBabyId, currentBaby }
}


async function generateBotBindCode(event, openid) {
  const user = await ensureUser(openid)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }

  const expireTime = new Date(Date.now() + 10 * 60 * 1000)

  await usersCollection.doc(user._id).update({
    data: {
      botBindCode: code,
      botBindCodeExpire: expireTime,
      updateTime: new Date()
    }
  })

  return {
    code: 0,
    data: {
      bindCode: code,
      expireTime: expireTime.toISOString(),
      expireMinutes: 10
    }
  }
}



async function sendBotMessage(event) {
  const { webhookUrl, text } = event

  if (!webhookUrl || !text) {
    return { code: 400, message: '缺少 webhookUrl 或 text' }
  }

  await postJson(webhookUrl, {
    msgtype: 'text',
    text: { content: text }
  })

  return { code: 0, message: '发送成功' }
}

function postJson(urlString, payload) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlString)
      const body = JSON.stringify(payload)
      const req = https.request(
        {
          method: 'POST',
          hostname: url.hostname,
          path: `${url.pathname}${url.search}`,
          port: url.port || 443,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        },
        (res) => {
          let raw = ''
          res.on('data', (chunk) => {
            raw += chunk
          })
          res.on('end', () => {
            const status = res.statusCode || 500
            if (status >= 200 && status < 300) {
              resolve(raw)
            } else {
              reject(new Error(`HTTP ${status}: ${raw}`))
            }
          })
        }
      )
      req.on('error', reject)
      req.write(body)
      req.end()
    } catch (err) {
      reject(err)
    }
  })
}

async function siriRecord(event) {
  const wxContext = cloud.getWXContext()
  const openidFromContext = wxContext.OPENID || ''
  const secretFromHeader = ((event && event.headers && event.headers['x-siri-secret']) || (event && event.headers && event.headers['X-Siri-Secret']) || '')
  const secret = event.secret || secretFromHeader
  const text = String(event.text || '').trim()
  const userId = String(event.userId || event.openid || '').trim()

  const siriSecret = process.env.SIRI_SECRET
  if (siriSecret && secret !== siriSecret) {
    return { code: 401, message: '认证失败' }
  }

  if (!text) {
    return { code: 400, message: '缺少文本内容' }
  }

  const parseResult = await cloud.callFunction({
    name: 'llm-parser',
    data: { text },
    config: {
      timeout: 30000
    }
  })

  const parsed = parseResult.result
  if (!parsed || parsed.code !== 0) {
    return { code: 500, message: 'LLM解析失败' }
  }

  const parsedRecords = Array.isArray(parsed.data) ? parsed.data : [parsed.data]
  const validRecords = parsedRecords.filter(Boolean)
  if (!validRecords.length) {
    return { code: 400, message: '未解析到可用记录' }
  }

  let actorOpenid = openidFromContext
  let familyId = ''

  if (actorOpenid) {
    familyId = await getFamilyId(actorOpenid)
  } else if (userId) {
    const siriUser = await ensureUserBySiriId(userId)
    actorOpenid = siriUser.openid
    familyId = siriUser.familyId
  } else {
    return { code: 400, message: '缺少用户标识（openid 或 userId）' }
  }

  const now = new Date()
  const { currentBabyId } = await getCurrentBaby(actorOpenid)
  const docs = validRecords.map((parsedData) => ({
    familyId,
    openid: actorOpenid,
    babyId: currentBabyId || '',
    type: parsedData.type || 'other',
    amount: toNullable(parsedData.amount),
    side: toNullable(parsedData.side),
    feedingType: toNullable(parsedData.feedingType),
    duration: toNullable(parsedData.duration),
    note: parsedData.note || '',
    recordTime: parseSiriRecordTime(parsedData.recordTime, now),
    source: 'siri',
    status: parsedData.needConfirm ? 'pending' : 'confirmed',
    createTime: new Date(),
    updateTime: new Date(),
    confidence: toNullable(parsedData.confidence)
  }))

  const addTasks = docs.map((doc) => recordsCollection.add({ data: doc }))
  const addResults = await Promise.all(addTasks)

  return {
    code: 0,
    data: {
      count: docs.length,
      ids: addResults.map((r) => r._id),
      records: docs
    }
  }
}
