const callApi = async (action, data = {}) => {
  const res = await wx.cloud.callFunction({
    name: 'babycare-api',
    data: { action, ...data }
  })
  if (res.result && res.result.code === 0) {
    return res.result
  }
  throw new Error(res.result?.message || '请求失败')
}

const parseFeedingText = async (text) => {
  const now = new Date()
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  const res = await wx.cloud.callFunction({
    name: 'llm-parser',
    data: { text, currentTime },
    config: {
      timeout: 30000
    }
  })
  if (res.result && res.result.code === 0) {
    return res.result
  }
  throw new Error(res.result?.message || 'LLM解析失败')
}

const formatTime = (date) => {
  if (!date) return ''
  const d = new Date(date)
  const now = new Date()
  const diff = now - d
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

const formatTimeHHMM = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

const formatInterval = (minutes) => {
  if (!minutes && minutes !== 0) return '--'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h}h${m}m`
  return `${m}分钟`
}

const getTypeLabel = (type) => {
  const map = {
    breastfeeding: '亲喂',
    bottle: '瓶喂',
    food: '辅食',
    supplement: '补剂',
    medicine: '药物',
    outdoor: '户外',
    swimming: '游泳',
    diaper: '换尿布',
    sleep: '睡眠',
    other: '其他'
  }
  return map[type] || type
}

const getTypeIcon = (type) => {
  const map = {
    breastfeeding: '亲',
    bottle: '瓶',
    food: '辅',
    supplement: '补',
    medicine: '药',
    outdoor: '户',
    swimming: '泳',
    diaper: '尿',
    sleep: '睡',
    other: '记'
  }
  return map[type] || '记'
}

const getTypeIconPath = (type) => {
  const map = {
    breastfeeding: '/assets/icons/type-breastfeeding.svg',
    bottle: '/assets/icons/type-bottle.svg',
    food: '/assets/icons/type-food.svg',
    supplement: '/assets/icons/type-supplement.svg',
    medicine: '/assets/icons/type-medicine.svg',
    outdoor: '/assets/icons/type-outdoor.svg',
    swimming: '/assets/icons/type-swimming.svg',
    diaper: '/assets/icons/type-diaper.svg',
    sleep: '/assets/icons/type-sleep.svg',
    other: '/assets/icons/type-other.svg'
  }
  return map[type] || '/assets/icons/type-other.svg'
}

const formatAmount = (amount, type) => {
  if (!amount && amount !== 0) return ''
  if (type === 'food') return `${amount}g`
  if (type === 'supplement' || type === 'medicine') return `${amount}`
  return `${amount}ml`
}

const getSideLabel = (side) => {
  const map = {
    left: '左侧',
    right: '右侧',
    both: '双侧',
    bottle: '瓶喂'
  }
  return map[side] || side || ''
}

module.exports = {
  callApi,
  parseFeedingText,
  formatTime,
  formatTimeHHMM,
  formatInterval,
  getTypeLabel,
  getTypeIcon,
  getTypeIconPath,
  getSideLabel,
  formatAmount
}
