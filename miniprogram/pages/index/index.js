const { callApi, parseFeedingText, formatTime, formatTimeHHMM, formatInterval, getTypeLabel, getTypeIcon, getSideLabel, formatAmount } = require('../../utils/api')

Page({
  data: {
    greetingText: '',
    todayDate: '',
    userAvatar: '/assets/icons/default-avatar.png',
    babyProfile: {
      name: '未设置宝宝',
      birthday: '',
      ageText: '--',
      weightG: '',
      heightCm: '',
      photoUrl: '/assets/icons/default-avatar.png'
    },
    todaySummary: { todayCount: 0, totalAmount: 0, formulaAmount: 0, breastMilkAmount: 0, foodAmount: 0, foodCount: 0, intervalMinutes: null },
    intervalText: '--',
    intervalWarning: false,
    todayRecords: [],
    pendingRecords: [],
    voiceText: '',
    isRecording: false,
    showQuickModal: false,
    quickModalTitle: '',
    quickModalType: '',
    quickAmount: '',
    quickDuration: '',
    quickSide: '左',
    quickBottleType: '奶粉',
    amountPresets: [60, 80, 100, 120, 150, 180],
    durationPresets: [5, 10, 15, 20, 30],
    foodPresets: [10, 20, 30, 50, 80],
    darkMode: false
  },

  onLoad() {
    this.syncDarkMode()
    this.setGreeting()
    this.initSpeechRecognition()
    this.loadData()
  },

  onShow() {
    this.syncDarkMode()
    this.loadData()
  },

  syncDarkMode() {
    const app = getApp()
    const darkMode = !!(app && app.globalData && app.globalData.darkMode)
    this.setData({ darkMode })
  },

  setGreeting() {
    const hour = new Date().getHours()
    let greetingText = '晚上好'
    if (hour >= 5 && hour < 12) greetingText = '早上好'
    else if (hour >= 12 && hour < 18) greetingText = '下午好'

    const now = new Date()
    const todayDate = `${now.getMonth() + 1}月${now.getDate()}日`

    const profile = this.data.babyProfile || {}
    const ageText = this.buildAgeText(profile.birthday)

    this.setData({
      greetingText,
      todayDate,
      babyProfile: { ...profile, ageText }
    })
  },

  buildAgeText(birthday) {
    if (!birthday) return '--'
    const birth = new Date(birthday)
    if (Number.isNaN(birth.getTime())) return '--'

    const days = Math.max(0, Math.floor((Date.now() - birth.getTime()) / (24 * 60 * 60 * 1000)))
    const months = Math.floor(days / 30)
    const restDays = days % 30
    if (months <= 0) return `${days}天`
    return `${months}月${restDays}天`
  },

  async loadData() {
    try {
      const res = await callApi('getTodaySummary')
      const { todayCount, totalAmount, formulaAmount, breastMilkAmount, foodAmount, foodCount, intervalMinutes, allRecords, lastRecord, currentBaby } = res.data

      const intervalText = formatInterval(intervalMinutes)
      const intervalWarning = intervalMinutes !== null && intervalMinutes > 180

      const confirmedRecords = allRecords
        .filter(r => r.status === 'confirmed')
        .map(r => this.formatRecord(r))

      const pendingRecords = allRecords
        .filter(r => r.status === 'pending')
        .map(r => this.formatRecord(r))

      const userInfo = getApp().globalData.userInfo
      const userAvatar = userInfo?.avatarUrl || '/assets/icons/default-avatar.png'

      const babyProfile = this.buildBabyProfile(currentBaby, userAvatar)
      wx.setStorageSync('currentBabyPhoto', babyProfile.photoUrl || userAvatar || '/assets/icons/default-avatar.png')
      getApp().globalData.currentBabyPhoto = babyProfile.photoUrl || userAvatar || '/assets/icons/default-avatar.png'

      this.setData({
        todaySummary: { todayCount, totalAmount, formulaAmount, breastMilkAmount, foodAmount, foodCount, intervalMinutes },
        intervalText,
        intervalWarning,
        todayRecords: confirmedRecords,
        pendingRecords,
        userAvatar,
        babyProfile
      })
    } catch (err) {
      console.error('加载数据失败:', err)
      wx.showToast({ title: '加载失败，请下拉重试', icon: 'none' })
    }
  },

  buildBabyProfile(currentBaby, userAvatar) {
    const birthday = currentBaby?.birthday || ''
    return {
      name: currentBaby?.name || '未设置宝宝',
      birthday,
      ageText: this.buildAgeText(birthday),
      weightG: currentBaby?.weightG ?? '',
      heightCm: currentBaby?.heightCm ?? '',
      photoUrl: currentBaby?.photoViewUrl || currentBaby?.photoUrl || userAvatar || '/assets/icons/default-avatar.png'
    }
  },


  formatRecord(r) {
    return {
      ...r,
      typeLabel: getTypeLabel(r.type),
      typeIcon: getTypeIcon(r.type),
      sideLabel: getSideLabel(r.side),
      timeText: formatTimeHHMM(r.recordTime),
      amountText: formatAmount(r.amount, r.type)
    }
  },

  onVoiceInput(e) {
    this.setData({ voiceText: e.detail.value })
  },

  initSpeechRecognition() {
    try {
      const plugin = requirePlugin('WechatSI')
      const manager = plugin.getRecordRecognitionManager()
      manager.onRecognize = (res) => {
        if (!res || !res.result) return
        this.setData({ voiceText: res.result })
      }
      manager.onStop = (res) => {
        this.setData({ isRecording: false })
        const result = (res && res.result) ? res.result.trim() : ''
        if (!result) {
          wx.showToast({ title: '未识别到语音，请重试', icon: 'none' })
          return
        }
        this.setData({ voiceText: result })
      }
      manager.onError = () => {
        this.setData({ isRecording: false })
        wx.showToast({ title: '语音识别失败，请稍后重试', icon: 'none' })
      }
      this.recordRecognitionManager = manager
    } catch (err) {
      this.recordRecognitionManager = null
      console.warn('WechatSI 插件不可用，降级为手动输入:', err)
    }
  },

  startRecord() {
    if (!this.recordRecognitionManager) {
      wx.showToast({ title: '当前环境不支持语音识别，请手动输入', icon: 'none' })
      return
    }

    this.setData({ isRecording: true })
    this.recordRecognitionManager.start({
      lang: 'zh_CN',
      duration: 30000
    })
  },

  stopRecord() {
    if (!this.recordRecognitionManager) return
    this.recordRecognitionManager.stop()
  },

  async submitVoiceText() {
    const { voiceText } = this.data
    if (!voiceText.trim()) return

    wx.showLoading({ title: 'AI解析中...' })
    try {
      const parseRes = await parseFeedingText(voiceText)
      wx.hideLoading()

      const parsed = parseRes.data
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
        wx.showToast({ title: '解析失败，请重试', icon: 'none' })
        return
      }

      if (parsed.length === 1 && parsed[0].needConfirm) {
        this.showConfirmDialog(parsed[0], voiceText)
      } else if (parsed.some(r => r.needConfirm)) {
        this.showMultiConfirmDialog(parsed, voiceText)
      } else {
        await this.saveRecords(parsed, 'siri')
        this.setData({ voiceText: '' })
        wx.showToast({ title: `已记录${parsed.length}条 ✓`, icon: 'none' })
        this.loadData()
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '解析失败: ' + err.message, icon: 'none' })
    }
  },

  showConfirmDialog(parsed, rawText) {
    const typeLabel = getTypeLabel(parsed.type)
    const details = [
      parsed.feedingType,
      parsed.side ? getSideLabel(parsed.side) : '',
      parsed.amount ? `${parsed.amount}${parsed.type === 'food' ? 'g' : 'ml'}` : '',
      parsed.duration ? `${parsed.duration}分钟` : '',
      parsed.note
    ].filter(Boolean).join(' ')

    wx.showModal({
      title: `确认记录${typeLabel}？`,
      content: details || rawText,
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          try {
            await this.saveRecords([parsed], 'miniprogram')
            this.setData({ voiceText: '' })
            wx.showToast({ title: '记录成功 ✓', icon: 'none' })
            this.loadData()
          } catch (err) {
            wx.showToast({ title: '保存失败: ' + err.message, icon: 'none' })
          }
        }
      }
    })
  },

  showMultiConfirmDialog(records, rawText) {
    const summary = records.map(r => {
      const typeLabel = getTypeLabel(r.type)
      const details = [
        r.feedingType,
        r.side ? getSideLabel(r.side) : '',
        r.amount ? `${r.amount}${r.type === 'food' ? 'g' : 'ml'}` : '',
        r.duration ? `${r.duration}分钟` : '',
        r.recordTime
      ].filter(Boolean).join(' ')
      return `${typeLabel}: ${details}`
    }).join('\n')

    wx.showModal({
      title: `确认记录${records.length}条？`,
      content: summary || rawText,
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          try {
            await this.saveRecords(records, 'miniprogram')
            this.setData({ voiceText: '' })
            wx.showToast({ title: `已记录${records.length}条 ✓`, icon: 'none' })
            this.loadData()
          } catch (err) {
            wx.showToast({ title: '保存失败: ' + err.message, icon: 'none' })
          }
        }
      }
    })
  },

  async saveRecords(records, source) {
    const tasks = records.map((record) => callApi('addRecord', {
      record: {
        type: record.type,
        amount: record.amount,
        side: record.side,
        feedingType: record.feedingType,
        duration: record.duration,
        note: record.note || '',
        recordTime: record.recordTime ? this.parseRecordTime(record.recordTime) : undefined,
        source: source || 'miniprogram'
      }
    }))
    await Promise.all(tasks)
  },

  parseRecordTime(timeStr) {
    if (!timeStr) return undefined
    const [hour, minute] = timeStr.split(':').map(Number)
    const now = new Date()
    const recordDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute)
    return recordDate.getTime()
  },

  quickRecord(e) {
    const type = e.currentTarget.dataset.type
    const titleMap = {
      breastfeeding: '亲喂',
      bottle: '瓶喂',
      food: '辅食',
      swimming: '游泳',
      diaper: '换尿布'
    }

    if (type === 'diaper') {
      wx.showModal({
        title: '记录换尿布',
        content: '确认记录换尿布？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await callApi('addRecord', { record: { type: 'diaper', source: 'miniprogram' } })
              wx.showToast({ title: '已记录 ✓', icon: 'none' })
              this.loadData()
            } catch (err) {
              wx.showToast({ title: '保存失败: ' + err.message, icon: 'none' })
            }
          }
        }
      })
      return
    }

    this.setData({
      showQuickModal: true,
      quickModalTitle: titleMap[type],
      quickModalType: type,
      quickAmount: '',
      quickDuration: '',
      quickSide: '左',
      quickBottleType: '奶粉'
    })
  },

  selectAmount(e) {
    this.setData({ quickAmount: e.currentTarget.dataset.amount.toString() })
  },

  selectDuration(e) {
    this.setData({ quickDuration: e.currentTarget.dataset.duration.toString() })
  },

  selectSide(e) {
    this.setData({ quickSide: e.currentTarget.dataset.side })
  },

  selectBottleType(e) {
    this.setData({ quickBottleType: e.currentTarget.dataset.btype })
  },

  onAmountInput(e) {
    this.setData({ quickAmount: e.detail.value })
  },

  onDurationInput(e) {
    this.setData({ quickDuration: e.detail.value })
  },

  async submitQuickRecord() {
    const { quickModalType, quickAmount, quickDuration, quickSide, quickBottleType } = this.data

    let record = { source: 'miniprogram' }

    if (quickModalType === 'breastfeeding') {
      const duration = parseInt(quickDuration, 10)
      if (!duration || duration <= 0) {
        wx.showToast({ title: '请输入时长', icon: 'none' })
        return
      }
      record = { ...record, type: 'breastfeeding', side: quickSide, duration }
    } else if (quickModalType === 'bottle') {
      const amount = parseFloat(quickAmount)
      if (!amount || amount <= 0) {
        wx.showToast({ title: '请输入奶量', icon: 'none' })
        return
      }
      record = { ...record, type: 'bottle', amount, feedingType: quickBottleType }
    } else if (quickModalType === 'food') {
      const amount = parseFloat(quickAmount)
      if (!amount || amount <= 0) {
        wx.showToast({ title: '请输入辅食量', icon: 'none' })
        return
      }
      record = { ...record, type: 'food', amount }
    } else if (quickModalType === 'swimming') {
      const duration = parseInt(quickDuration, 10)
      if (!duration || duration <= 0) {
        wx.showToast({ title: '请输入时长', icon: 'none' })
        return
      }
      record = { ...record, type: 'swimming', duration }
    }

    try {
      await callApi('addRecord', { record })
      this.setData({ showQuickModal: false })
      wx.showToast({ title: '记录成功 ✓', icon: 'none' })
      this.loadData()
    } catch (err) {
      wx.showToast({ title: '保存失败: ' + err.message, icon: 'none' })
    }
  },

  closeModal() {
    this.setData({ showQuickModal: false })
  },

  async confirmRecord(e) {
    const id = e.currentTarget.dataset.id
    try {
      await callApi('updateRecord', { id, record: { status: 'confirmed' } })
      wx.showToast({ title: '已确认 ✓', icon: 'none' })
      this.loadData()
    } catch (err) {
      wx.showToast({ title: '确认失败: ' + err.message, icon: 'none' })
    }
  },

  async deleteRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后可在7天内恢复',
      success: async (res) => {
        if (res.confirm) {
          try {
            await callApi('deleteRecord', { id })
            wx.showToast({ title: '已删除', icon: 'none' })
            this.loadData()
          } catch (err) {
            wx.showToast({ title: '删除失败: ' + err.message, icon: 'none' })
          }
        }
      }
    })
  },

  editRecord(e) {
    const id = e.currentTarget.dataset.id
    getApp().globalData.editRecordId = id
    wx.switchTab({ url: '/pages/record/record' })
  },

  goRecord() {
    wx.switchTab({ url: '/pages/record/record' })
  },

  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' })
  },

  onVoiceRecordSuccess() {
    this.loadData()
  },
})
