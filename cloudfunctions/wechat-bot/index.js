const cloud = require('wx-server-sdk')
const dayjs = require('dayjs')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const recordsCollection = db.collection('feeding_records')
const botBindingsCollection = db.collection('bot_bindings')
const babiesCollection = db.collection('babies')

const KEYWORDS = [
  '喂奶', '喂了', '奶粉', '母乳', '亲喂', '瓶喂', '辅食', '游泳', '换尿布', '睡觉',
  '记录', 'ml', '毫升', '分钟', '左边', '右边', '左侧', '右侧'
]

exports.main = async (event) => {
  const { httpMethod, body, queryStringParameters } = event

  if (httpMethod === 'GET') {
    return handleVerification(queryStringParameters)
  }

  if (httpMethod === 'POST') {
    return handleMessage(body)
  }

  return { statusCode: 405, body: 'Method Not Allowed' }
}

function handleVerification(params) {
  const { echostr } = params || {}
  if (!echostr) return { statusCode: 400, body: 'Bad Request' }
  return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: echostr }
}

async function handleMessage(body) {
  try {
    const message = typeof body === 'string' ? JSON.parse(body) : (body || {})
    const { msgtype, text, from, chatid, mentioned_list } = message

    if (msgtype !== 'text' || !text || !chatid) {
      return { statusCode: 200, body: 'ok' }
    }

    const content = (text.content || '').trim()
    const hasBotMention = content.includes('@宝宝小助手') || content.includes('@喂养助手')
    const isMentioned = Array.isArray(mentioned_list) && mentioned_list.includes('@all')
    const hasKeyword = KEYWORDS.some((kw) => content.includes(kw))

    if (!hasBotMention && !isMentioned && !hasKeyword) {
      return { statusCode: 200, body: 'ok' }
    }

    const cleanContent = content
      .replace(/@宝宝小助手/g, '')
      .replace(/@喂养助手/g, '')
      .trim()

    if (isBindRequest(cleanContent)) {
      const bindCode = extractBindCode(cleanContent)
      const reply = await handleBindCommand(chatid, bindCode, from)
      await sendBotReply(chatid, reply)
      return { statusCode: 200, body: 'ok' }
    }

    if (isHelpRequest(cleanContent)) {
      await sendBotReply(chatid, getHelpMessage())
      return { statusCode: 200, body: 'ok' }
    }

    if (isQueryRequest(cleanContent)) {
      const summary = await getTodaySummaryForBot(chatid)
      await sendBotReply(chatid, summary)
      return { statusCode: 200, body: 'ok' }
    }

    const parsedList = await parseFeedingText(cleanContent)
    if (!parsedList.length) {
      await sendBotReply(chatid, '🤔 未识别到可记录内容，发送“帮助”查看示例。')
      return { statusCode: 200, body: 'ok' }
    }

    const binding = await getBotBinding(chatid)
    if (!binding) {
      await sendBotReply(chatid, '⚠️ 此群尚未绑定宝宝账号，请先发送“绑定 XXXXXX”。')
      return { statusCode: 200, body: 'ok' }
    }

    const docs = parsedList
      .filter((item) => item && item.type)
      .map((parsed) => ({
        familyId: binding.familyId,
        openid: `bot_${from || 'unknown'}`,
        babyId: binding.currentBabyId || '',
        type: parsed.type || 'other',
        amount: toNullable(parsed.amount),
        side: toNullable(parsed.side),
        feedingType: toNullable(parsed.feedingType),
        duration: toNullable(parsed.duration),
        note: parsed.note || '',
        recordTime: parseRecordTime(parsed.recordTime),
        source: 'wechat_bot',
        botChatId: chatid,
        botSender: from,
        status: parsed.needConfirm ? 'pending' : 'confirmed',
        confidence: toNullable(parsed.confidence),
        createTime: new Date(),
        updateTime: new Date()
      }))

    if (!docs.length) {
      await sendBotReply(chatid, '🤔 未识别到可记录内容，发送“帮助”查看示例。')
      return { statusCode: 200, body: 'ok' }
    }

    await Promise.all(docs.map((doc) => recordsCollection.add({ data: doc })))
    await sendBotReply(chatid, buildReplyMessage(docs))

    return { statusCode: 200, body: 'ok' }
  } catch (err) {
    console.error('wechat-bot error:', err)
    return { statusCode: 200, body: 'ok' }
  }
}

async function parseFeedingText(text) {
  try {
    const currentTime = dayjs().format('HH:mm')
    const parserRes = await cloud.callFunction({
      name: 'llm-parser',
      data: { text, currentTime },
      config: { timeout: 30000 }
    })

    const result = parserRes.result
    if (!result || result.code !== 0) return []

    const list = Array.isArray(result.data) ? result.data : [result.data]
    return list.filter(Boolean)
  } catch (err) {
    console.error('调用llm-parser失败，使用规则解析:', err)
    return fallbackParse(text)
  }
}

function fallbackParse(text) {
  const segments = String(text || '').split(/[，,、；;。]/).map((s) => s.trim()).filter(Boolean)
  if (!segments.length) return []

  return segments.map((segment) => {
    const result = {
      type: 'bottle',
      amount: null,
      side: null,
      feedingType: null,
      duration: null,
      note: segment,
      recordTime: inferTimeFromText(segment),
      confidence: 0.5,
      needConfirm: true
    }

    const amountMatch = segment.match(/(\d+(?:\.\d+)?)\s*(?:ml|毫升|ML|g|克)?/)
    if (amountMatch) {
      result.amount = parseFloat(amountMatch[1])
      if (/[g克]/.test(segment)) result.type = 'food'
    }

    if (segment.includes('左')) result.side = '左'
    else if (segment.includes('右')) result.side = '右'
    else if (segment.includes('双')) result.side = '双'

    if (segment.includes('奶粉')) result.feedingType = '奶粉'
    else if (segment.includes('母乳')) result.feedingType = '母乳'
    else if (segment.includes('水')) result.feedingType = '水'
    else if (segment.includes('补剂')) result.feedingType = '补剂'

    if (segment.includes('亲喂') || (segment.includes('喂') && !result.amount)) {
      result.type = 'breastfeeding'
      result.side = result.side || '双'
      result.feedingType = null
      const durationMatch = segment.match(/(\d+)\s*(?:分钟|min)/)
      if (durationMatch) result.duration = parseInt(durationMatch[1], 10)
      result.amount = null
    } else if (segment.includes('游泳')) {
      result.type = 'swimming'
      const durationMatch = segment.match(/(\d+)\s*(?:分钟|min)/)
      if (durationMatch) result.duration = parseInt(durationMatch[1], 10)
      result.amount = null
      result.feedingType = null
    } else if (segment.includes('尿布') || segment.includes('屎') || segment.includes('拉')) {
      result.type = 'diaper'
      result.amount = null
      result.feedingType = null
    } else if (segment.includes('睡') || segment.includes('觉')) {
      result.type = 'sleep'
      const durationMatch = segment.match(/(\d+)\s*(?:分钟|min|小时)/)
      if (durationMatch) result.duration = parseInt(durationMatch[1], 10)
      result.amount = null
      result.feedingType = null
    } else if (!result.amount && !result.feedingType) {
      result.type = 'other'
    }

    if (result.type === 'bottle' && !result.feedingType) {
      result.feedingType = '奶粉'
    }

    return result
  })
}

function inferTimeFromText(text) {
  const m = text.match(/(\d{1,2})[:点时](\d{1,2})?/) || text.match(/(\d{1,2})[:：](\d{1,2})/)
  if (!m) return null
  let hour = Math.min(23, Math.max(0, Number(m[1])))
  const minute = Math.min(59, Math.max(0, Number(m[2] || 0)))
  if (text.includes('下午') || text.includes('晚上') || text.includes('傍晚')) {
    if (hour < 12) hour += 12
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function toNullable(value) {
  return (value === undefined || value === null) ? null : value
}

function parseRecordTime(recordTimeText) {
  if (!recordTimeText || typeof recordTimeText !== 'string') return new Date()
  const m = recordTimeText.match(/^(\d{1,2}):(\d{1,2})$/)
  if (m) {
    const d = new Date()
    const h = Math.min(23, Math.max(0, Number(m[1])))
    const min = Math.min(59, Math.max(0, Number(m[2])))
    d.setHours(h, min, 0, 0)
    return d
  }
  const dt = new Date(recordTimeText)
  return Number.isNaN(dt.getTime()) ? new Date() : dt
}

function isBindRequest(text) {
  return /^绑定\s*[A-Z0-9]{6}$/i.test(String(text || '').trim())
}

function extractBindCode(text) {
  const match = String(text || '').trim().match(/^绑定\s*([A-Z0-9]{6})$/i)
  return match ? match[1].toUpperCase() : null
}

async function handleBindCommand(chatid, bindCode, sender) {
  if (!bindCode) {
    return '❌ 绑定码格式错误，请发送“绑定 XXXXXX”（6位字母数字）'
  }

  const usersCollection = db.collection('users')
  const userResult = await usersCollection
    .where({ botBindCode: bindCode, botBindCodeExpire: db.command.gte(new Date()) })
    .limit(1)
    .get()

  if (!userResult.data.length) {
    return '❌ 绑定码无效或已过期，请在小程序设置页重新生成。'
  }

  const user = userResult.data[0]
  const existingBinding = await botBindingsCollection.where({ chatid, status: 'active' }).limit(1).get()

  if (existingBinding.data.length) {
    await botBindingsCollection.doc(existingBinding.data[0]._id).update({
      data: {
        familyId: user.familyId,
        openid: user.openid,
        currentBabyId: await resolveCurrentBabyId(user),
        bindBy: sender,
        updateTime: new Date()
      }
    })
  } else {
    await botBindingsCollection.add({
      data: {
        chatid,
        familyId: user.familyId,
        openid: user.openid,
        currentBabyId: await resolveCurrentBabyId(user),
        bindBy: sender,
        status: 'active',
        createTime: new Date(),
        updateTime: new Date()
      }
    })
  }

  await usersCollection.doc(user._id).update({
    data: { botBindCode: null, botBindCodeExpire: null, updateTime: new Date() }
  })

  return `✅ 绑定成功\n\n🍼 此群已与宝宝账号绑定\n👤 绑定人：${sender || '未知'}\n📝 现在可以直接发送记录了\n\n发送“帮助”查看使用方法。`
}

function isQueryRequest(text) {
  const queryWords = ['今天', '今日', '查看', '报表', '统计', '喝了多少', '喂了几次', '总量']
  return queryWords.some((word) => text.includes(word))
}

function isHelpRequest(text) {
  const lower = String(text || '').toLowerCase()
  const helpWords = ['帮助', 'help', '怎么用', '使用方法', '命令']
  return helpWords.some((word) => lower.includes(word))
}

function getHelpMessage() {
  return `🍼 宝宝小助手使用指南\n\n📝 记录示例：\n• 奶粉150ml\n• 亲喂左侧20分钟\n• 12点换尿布\n• 下午3点游泳15分钟\n\n📊 查询示例：\n• 今天喂了多少\n• 今日统计\n\n🔗 绑定账号：\n• 绑定 XXXXXX（6位绑定码）\n\n⚠️ 提示：语音消息请先转文字再发送。`
}

async function getTodaySummaryForBot(chatid) {
  const binding = await getBotBinding(chatid)
  if (!binding) return '⚠️ 此群尚未绑定宝宝账号。'

  const today = dayjs().format('YYYY-MM-DD')
  const start = dayjs(today).startOf('day').toDate()
  const end = dayjs(today).endOf('day').toDate()

  const result = await recordsCollection
    .where({
      familyId: binding.familyId,
      status: db.command.neq('deleted'),
      recordTime: db.command.gte(start).and(db.command.lte(end))
    })
    .orderBy('recordTime', 'desc')
    .get()

  const records = result.data || []
  const scopedRecords = records.filter((r) => isRecordMatchCurrentBaby(r, binding.currentBabyId))
  const milkRecords = scopedRecords.filter((r) => r.type === 'breastfeeding' || r.type === 'bottle')
  const totalAmount = milkRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  const lastRecord = milkRecords[0]

  let intervalText = '暂无记录'
  if (lastRecord && lastRecord.recordTime) {
    const minutes = Math.floor((Date.now() - new Date(lastRecord.recordTime).getTime()) / 60000)
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    intervalText = h > 0 ? `${h}小时${m}分钟` : `${m}分钟`
  }

  const recentLines = milkRecords.slice(0, 3).map((r) => {
    const time = dayjs(r.recordTime).format('HH:mm')
    const details = []
    if (r.feedingType) details.push(r.feedingType)
    if (r.side) details.push(`${r.side}侧`)
    if (r.amount) details.push(`${r.amount}ml`)
    if (r.duration) details.push(`${r.duration}分钟`)
    return `• ${time} ${details.join(' ')}`.trim()
  }).join('\n')

  return `📊 今日喂养统计（${today}）\n\n🍼 喂养次数：${milkRecords.length}次\n💧 总奶量：${totalAmount}ml\n⏰ 距上次：${intervalText}\n\n${recentLines || '暂无喂养明细'}\n\n📱 查看完整报表请打开小程序。`
}

async function resolveCurrentBabyId(user) {
  if (user.currentBabyId) return user.currentBabyId
  const babyRes = await babiesCollection
    .where({ familyId: user.familyId, status: db.command.neq('deleted') })
    .orderBy('createTime', 'asc')
    .limit(1)
    .get()
  return (babyRes.data[0] && babyRes.data[0]._id) ? babyRes.data[0]._id : ''
}

function isRecordMatchCurrentBaby(record, currentBabyId) {
  if (!currentBabyId) return true
  return !record.babyId || record.babyId === currentBabyId
}

async function getBotBinding(chatid) {
  const result = await botBindingsCollection.where({ chatid, status: 'active' }).limit(1).get()
  return result.data[0] || null
}

async function sendBotReply(chatid, text) {
  const webhookUrl = process.env.BOT_WEBHOOK_URL
  if (!webhookUrl) {
    console.log('BOT_WEBHOOK_URL未配置，跳过发送:', text)
    return
  }

  try {
    await cloud.callFunction({
      name: 'babycare-api',
      data: { action: '_sendBotMessage', webhookUrl, text, chatid }
    })
  } catch (err) {
    console.error('发送机器人消息失败:', err)
  }
}

function buildReplyMessage(records) {
  const typeMap = {
    breastfeeding: '亲喂',
    bottle: '瓶喂',
    food: '辅食',
    swimming: '游泳',
    diaper: '换尿布',
    sleep: '睡眠',
    other: '其他'
  }

  const first = records[0]
  const firstType = typeMap[first.type] || '记录'
  const hasPending = records.some((r) => r.status === 'pending')

  const lines = records.slice(0, 3).map((r) => {
    const time = dayjs(r.recordTime).format('HH:mm')
    const details = []
    if (r.feedingType) details.push(r.feedingType)
    if (r.side) details.push(`${r.side}侧`)
    if (r.amount) details.push(`${r.amount}ml`)
    if (r.duration) details.push(`${r.duration}分钟`)
    return `• ${time} ${typeMap[r.type] || r.type}${details.length ? ` ${details.join(' ')}` : ''}`
  }).join('\n')

  return `✅ 已记录${records.length}条（首条：${firstType}）\n${lines}${hasPending ? '\n⚠️ 含待确认记录，请在小程序确认。' : ''}\n\n📱 查看完整报表请打开小程序。`
}
