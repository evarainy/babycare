const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('users')
const babiesCollection = db.collection('babies')

exports.main = async (event = {}) => {
  const { action, profile } = event

  if (action === 'saveProfile') {
    return saveProfile(profile || {})
  }

  return getProfile()
}

async function ensureUser() {
  const { OPENID } = cloud.getWXContext()
  const existing = await usersCollection.where({ openid: OPENID }).limit(1).get()

  if (existing.data.length) {
    const user = existing.data[0]
    if (!user.familyId) {
      const familyId = OPENID
      await usersCollection.doc(user._id).update({
        data: {
          familyId,
          updateTime: new Date()
        }
      })
      return { ...user, familyId }
    }
    return user
  }

  const familyId = OPENID
  const now = new Date()
  const created = await usersCollection.add({
    data: {
      openid: OPENID,
      familyId,
      currentBabyId: '',
      createTime: now,
      updateTime: now
    }
  })

  return {
    _id: created._id,
    openid: OPENID,
    familyId,
    currentBabyId: ''
  }
}

async function resolveCurrentBaby(user) {
  if (user.currentBabyId) {
    try {
      const baby = await babiesCollection.doc(user.currentBabyId).get()
      if (baby.data && baby.data.status !== 'deleted') {
        return baby.data
      }
    } catch (err) {}
  }

  const result = await babiesCollection
    .where({
      familyId: user.familyId,
      status: _.neq('deleted')
    })
    .orderBy('createTime', 'asc')
    .limit(1)
    .get()

  const currentBaby = result.data[0] || null
  if (currentBaby && currentBaby._id !== user.currentBabyId) {
    await usersCollection.doc(user._id).update({
      data: {
        currentBabyId: currentBaby._id,
        updateTime: new Date()
      }
    })
  }
  return currentBaby
}

async function getProfile() {
  const user = await ensureUser()
  const currentBaby = await resolveCurrentBaby(user)
  return {
    code: 0,
    data: {
      currentBaby
    }
  }
}

async function saveProfile(profile) {
  const user = await ensureUser()
  const currentBaby = await resolveCurrentBaby(user)
  const now = new Date()
  const payload = {
    name: String(profile.name || '').trim(),
    birthday: profile.birthday || '',
    gender: profile.gender || 'unknown',
    heightCm: profile.heightCm === null || profile.heightCm === undefined ? null : Number(profile.heightCm),
    weightG: profile.weightG === null || profile.weightG === undefined ? null : Number(profile.weightG),
    photoUrl: String(profile.photoUrl || '').trim(),
    note: String(profile.note || '').trim(),
    updateTime: now
  }

  if (!payload.name) {
    return { code: 400, message: '宝宝姓名不能为空' }
  }

  if (payload.heightCm !== null && Number.isNaN(payload.heightCm)) payload.heightCm = null
  if (payload.weightG !== null && Number.isNaN(payload.weightG)) payload.weightG = null

  if (currentBaby) {
    await babiesCollection.doc(currentBaby._id).update({
      data: payload
    })
    return {
      code: 0,
      data: {
        currentBabyId: currentBaby._id
      }
    }
  }

  const created = await babiesCollection.add({
    data: {
      ...payload,
      familyId: user.familyId,
      status: 'active',
      createTime: now
    }
  })

  await usersCollection.doc(user._id).update({
    data: {
      currentBabyId: created._id,
      updateTime: now
    }
  })

  return {
    code: 0,
    data: {
      currentBabyId: created._id
    }
  }
}
