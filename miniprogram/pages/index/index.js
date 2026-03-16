const {
  callApi,
  parseFeedingText,
  formatTimeHHMM,
  formatInterval,
  getTypeLabel,
  getTypeIconPath,
  getSideLabel,
  formatAmount
} = require('../../utils/api')

const DEFAULT_BABY_PHOTO = '/assets/icons/default-avatar.png'

Page({
  data: {
    todayDate: '',
    safeTop: 0,
    quickScrollLeft: 0,
    userAvatar: DEFAULT_BABY_PHOTO,
    weatherInfo: {
      text: '晴朗',
      temperatureText: '24°C',
      humidityText: '52%',
      advice: '适合外出晒太阳，注意补水。',
      iconPath: '/assets/icons/weather-sunny.svg'
    },
    babyProfile: {
      name: '未设置宝宝',
      birthday: '',
      ageText: '--',
      weightG: '',
      heightCm: '',
      photoUrl: DEFAULT_BABY_PHOTO
    },
    todaySummary: {
      todayCount: 0,
      totalAmount: 0,
      formulaAmount: 0,
      breastMilkAmount: 0,
      waterAmount: 0,
      directFeedDuration: 0,
      directFeedDurationText: '0分钟',
      foodAmount: 0,
      foodCount: 0,
      intervalMinutes: null
    },
    intervalText: '--',
    intervalWarning: false,
    todayRecords: [],
    pendingRecords: [],
    voiceText: '',
    showQuickModal: false,
    quickModalTitle: '',
    quickModalType: '',
    quickAmount: '',
    quickDuration: '',
    quickSide: 'left',
    quickBottleType: '奶粉',
    quickItemName: 'AD',
    quickUnit: 'ml',
    quickTimeStr: '',
    quickNote: '',
    quickEvent: '',
    amountPresets: [60, 80, 100, 120, 150, 180],
    durationPresets: [5, 10, 15, 20, 30],
    foodPresets: [10, 20, 30, 50, 80],
    supplementNameOptions: ['AD', 'D', '乳铁蛋白', '益生菌'],
    unitOptions: ['g', 'ml', '粒'],
    darkMode: false
  },

  onLoad() {
    this.initLayoutMetrics()
    this.syncDarkMode()
    this.setTodayMeta()
    this._skipNextOnShowLoad = true
    this.loadData()
    this.loadWeather()
    this.playQuickScrollHint()
  },

  onShow() {
    this.syncDarkMode()
    this.setTodayMeta()
    if (this._skipNextOnShowLoad) {
      this._skipNextOnShowLoad = false
      return
    }
    this.loadData()
    this.loadWeather()
  },

  async onPullDownRefresh() {
    this.syncDarkMode()
    this.setTodayMeta()
    try {
      try {
        await this.loadData()
      } catch (err) {}
      try {
        await this.loadWeather()
      } catch (err) {}
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  initLayoutMetrics() {
    let safeTop = 0
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const statusBarHeight = info.statusBarHeight || 0
      const safeAreaTop = info.safeArea && info.safeArea.top ? info.safeArea.top : 0
      safeTop = Math.max(statusBarHeight, safeAreaTop)
    } catch (err) {}
    this.setData({ safeTop })
  },

  syncDarkMode() {
    const app = getApp()
    const darkMode = !!(app && app.globalData && app.globalData.darkMode)
    this.setData({ darkMode })
  },

  setTodayMeta() {
    const now = new Date()
    const todayDate = `${now.getMonth() + 1}月${now.getDate()}日`
    const profile = this.data.babyProfile || {}
    const ageText = this.buildAgeText(profile.birthday)

    this.setData({
      todayDate,
      weatherInfo: this.buildWeatherInfo(now),
      babyProfile: { ...profile, ageText }
    })
  },

  buildWeatherInfo(now = new Date()) {
    const month = now.getMonth() + 1
    const hour = now.getHours()
    const rainySeason = [4, 5, 6, 7, 8, 9]
    const isRainy = rainySeason.includes(month) && (hour < 8 || hour >= 18)
    const isCloudy = !isRainy && (month === 3 || month === 10 || month === 11)

    let text = '晴朗'
    let iconPath = '/assets/icons/weather-sunny.svg'
    let baseTemp = 24
    let humidity = 52
    let advice = '适合外出晒太阳，注意补水。'

    if (month === 12 || month <= 2) {
      text = '晴冷'
      baseTemp = 16
      humidity = 45
      advice = '天气偏干，注意保暖和室内补水。'
    } else if (isRainy) {
      text = '小雨'
      iconPath = '/assets/icons/weather-rainy.svg'
      baseTemp = month >= 6 && month <= 8 ? 27 : 21
      humidity = 76
      advice = '空气偏潮，出门带薄毯并及时擦汗。'
    } else if (isCloudy) {
      text = '多云'
      iconPath = '/assets/icons/weather-cloudy.svg'
      baseTemp = month >= 10 ? 20 : 23
      humidity = 61
      advice = '温差稍大，建议备一件薄外套。'
    }

    if (hour >= 12 && hour <= 15) {
      baseTemp += 2
      humidity = Math.max(38, humidity - 4)
    }

    return {
      text,
      iconPath,
      temperatureText: `${baseTemp}°C`,
      humidityText: `${humidity}%`,
      advice
    }
  },

  getWeatherIconPath(weatherText = '') {
    const text = String(weatherText || '')
    if (/雷|暴雨|雷阵雨|强对流|冰雹/.test(text)) return '/assets/icons/weather-thunder.svg'
    if (/雪|雨夹雪|冻雨/.test(text)) return '/assets/icons/weather-snow.svg'
    if (/霾|扬沙|浮尘|沙尘/.test(text)) return '/assets/icons/weather-haze.svg'
    if (/雾|轻雾|浓雾/.test(text)) return '/assets/icons/weather-fog.svg'
    if (/阴/.test(text)) return '/assets/icons/weather-overcast.svg'
    if (/风|大风|飓风|龙卷/.test(text)) return '/assets/icons/weather-windy.svg'
    if (/暴雨|大雨|中雨|小雨|阵雨|雨/.test(text)) return '/assets/icons/weather-rainy.svg'
    if (/多云|少云|晴间多云|云/.test(text)) return '/assets/icons/weather-cloudy.svg'
    return '/assets/icons/weather-sunny.svg'
  },

  buildWeatherAdvice(weatherData = {}) {
    const weatherText = weatherData.weather || weatherData.text || ''
    const temperature = Number(weatherData.temperature)
    if (/霾|扬沙|浮尘|沙尘/.test(weatherText)) return '空气质量一般，外出尽量缩短时长并做好防护。'
    if (/雾|轻雾|浓雾/.test(weatherText)) return '能见度偏低，外出注意保暖和出行安全。'
    if (/雨/.test(weatherText)) return '出门记得带雨具，注意保暖和擦汗。'
    if (!Number.isNaN(temperature) && temperature >= 30) return '天气偏热，外出注意遮阳和补水。'
    if (!Number.isNaN(temperature) && temperature <= 10) return '天气偏凉，外出记得加一层衣物。'
    if (/阴|云/.test(weatherText)) return '适合短时外出，注意早晚温差。'
    return '适合外出活动，注意补水和防晒。'
  },

  requestTencentIpLocation(url) {
    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method: 'GET',
        success: resolve,
        fail: reject
      })
    })
  },

  async loadWeather() {
    try {
      const ipSignRes = await wx.cloud.callFunction({
        name: 'tencent-weather',
        data: { action: 'getSignedIpUrl' }
      })
      const signedIpUrl = ipSignRes && ipSignRes.result && ipSignRes.result.data && ipSignRes.result.data.url
      let weatherRes

      if (signedIpUrl) {
        const ipRes = await this.requestTencentIpLocation(signedIpUrl)
        const ipResult = ipRes && ipRes.data && ipRes.data.result
        if (ipResult && ipResult.location) {
          weatherRes = await wx.cloud.callFunction({
            name: 'tencent-weather',
            data: {
              action: 'getWeatherByLocation',
              location: ipResult.location,
              city: ipResult.ad_info && ipResult.ad_info.city,
              district: ipResult.ad_info && ipResult.ad_info.district,
              province: ipResult.ad_info && ipResult.ad_info.province
            }
          })
          if (!weatherRes || !weatherRes.result || weatherRes.result.code !== 0) {
            weatherRes = null
          }
        }
      }

      if (!weatherRes) {
        weatherRes = await wx.cloud.callFunction({
          name: 'tencent-weather',
          data: { action: 'getCurrentWeather' }
        })
      }

      const data = weatherRes && weatherRes.result && weatherRes.result.data
      if (!data) return
      this.setData({
        weatherInfo: {
          text: data.weather || data.text || '--',
          temperatureText: `温度：${data.temperatureText || '--'}`,
          humidityText: `湿度：${data.humidityText || '--'}`,
          advice: data.advice || this.buildWeatherAdvice(data),
          iconPath: this.getWeatherIconPath(data.weather || data.text),
          source: 'remote',
          updateTime: data.updateTime || Date.now(),
          locationText: data.district || data.city || ''
        }
      })
    } catch (err) {
      console.error('加载天气失败:', err)
    }
  },

  playQuickScrollHint() {
    if (wx.getStorageSync('indexQuickScrollHintPlayed')) return
    setTimeout(() => {
      this.setData({ quickScrollLeft: 154 })
      setTimeout(() => {
        this.setData({ quickScrollLeft: 0 })
        wx.setStorageSync('indexQuickScrollHintPlayed', true)
      }, 900)
    }, 1200)
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
      const {
        todayCount,
        totalAmount,
        formulaAmount,
        breastMilkAmount,
        waterAmount,
        foodAmount,
        foodCount,
        intervalMinutes,
        allRecords,
        currentBaby
      } = res.data

      const intervalText = formatInterval(intervalMinutes)
      const intervalWarning = intervalMinutes !== null && intervalMinutes > 180

      const confirmedRecords = allRecords
        .filter((record) => record.status === 'confirmed')
        .map((record) => this.formatRecord(record))

      const pendingRecords = allRecords
        .filter((record) => record.status === 'pending')
        .map((record) => this.formatRecord(record))

      const directFeedDuration = allRecords
        .filter((record) => record.status === 'confirmed' && record.type === 'breastfeeding')
        .reduce((sum, record) => sum + (Number(record.duration) || 0), 0)

      const userInfo = getApp().globalData.userInfo
      const userAvatar = (userInfo && userInfo.avatarUrl) || DEFAULT_BABY_PHOTO
      const babyProfile = this.buildBabyProfile(currentBaby)

      const nextPhoto = babyProfile.photoUrl || DEFAULT_BABY_PHOTO
      if (this._lastBabyPhoto !== nextPhoto) {
        this._lastBabyPhoto = nextPhoto
        wx.setStorageSync('currentBabyPhoto', nextPhoto)
        getApp().globalData.currentBabyPhoto = nextPhoto
      }

      this.setData({
        todaySummary: {
          todayCount,
          totalAmount,
          formulaAmount,
          breastMilkAmount,
          waterAmount,
          directFeedDuration,
          directFeedDurationText: this.formatDurationMinutes(directFeedDuration),
          foodAmount,
          foodCount,
          intervalMinutes
        },
        intervalText,
        intervalWarning,
        todayRecords: confirmedRecords,
        pendingRecords,
        userAvatar,
        babyProfile
      })
      return res
    } catch (err) {
      console.error('加载今日数据失败:', err)
      wx.showToast({ title: '加载失败，请下拉重试', icon: 'none' })
    }
  },

  buildBabyProfile(currentBaby) {
    const birthday = currentBaby?.birthday || ''
    return {
      name: currentBaby?.name || '未设置宝宝',
      birthday,
      ageText: this.buildAgeText(birthday),
      weightG: currentBaby?.weightG ?? '',
      heightCm: currentBaby?.heightCm ?? '',
      photoUrl: currentBaby?.photoViewUrl || currentBaby?.photoUrl || DEFAULT_BABY_PHOTO
    }
  },

  formatDurationMinutes(minutes) {
    const totalMinutes = Number(minutes) || 0
    if (totalMinutes <= 0) return '0分钟'
    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    if (hours <= 0) return `${mins}分钟`
    if (mins <= 0) return `${hours}小时`
    return `${hours}小时${mins}分钟`
  },

  getRecordAmountText(record) {
    if (record.type === 'supplement' || record.type === 'medicine') {
      if (record.amount === null || record.amount === undefined || record.amount === '') return ''
      return `${record.amount}${record.unit || ''}`
    }
    return formatAmount(record.amount, record.type)
  },

  formatRecord(record) {
    return {
      ...record,
      typeLabel: getTypeLabel(record.type),
      typeIconPath: getTypeIconPath(record.type),
      sideLabel: getSideLabel(record.side),
      timeText: formatTimeHHMM(record.recordTime),
      amountText: this.getRecordAmountText(record)
    }
  },

  onVoiceInput(e) {
    this.setData({ voiceText: e.detail.value })
  },

  onBabyImageError() {
    const fallback = DEFAULT_BABY_PHOTO
    if ((this.data.babyProfile && this.data.babyProfile.photoUrl) === fallback) return
    this.setData({ 'babyProfile.photoUrl': fallback })
  },

  onUserImageError() {
    const fallback = DEFAULT_BABY_PHOTO
    if (this.data.userAvatar === fallback) return
    this.setData({ userAvatar: fallback })
  },

  buildConfirmAmountText(record) {
    if (!record || record.amount === null || record.amount === undefined || record.amount === '') return ''
    if (record.type === 'food') return `${record.amount}g`
    if (record.type === 'supplement' || record.type === 'medicine') return `${record.amount}${record.unit || ''}`
    return `${record.amount}ml`
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
      } else if (parsed.some((record) => record.needConfirm)) {
        this.showMultiConfirmDialog(parsed, voiceText)
      } else {
        await this.saveRecords(parsed, 'siri')
        this.setData({ voiceText: '' })
        wx.showToast({ title: `已记录 ${parsed.length} 条`, icon: 'none' })
        this.loadData()
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: `解析失败: ${err.message}`, icon: 'none' })
    }
  },

  showConfirmDialog(parsed, rawText) {
    const typeLabel = getTypeLabel(parsed.type)
    const details = [
      parsed.itemName,
      parsed.feedingType,
      parsed.side ? getSideLabel(parsed.side) : '',
      this.buildConfirmAmountText(parsed),
      parsed.duration ? `${parsed.duration}分钟` : '',
      parsed.note
    ].filter(Boolean).join(' ')

    wx.showModal({
      title: `确认记录${typeLabel}？`,
      content: details || rawText,
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await this.saveRecords([parsed], 'miniprogram')
          this.setData({ voiceText: '' })
          wx.showToast({ title: '记录成功', icon: 'none' })
          this.loadData()
        } catch (err) {
          wx.showToast({ title: `保存失败: ${err.message}`, icon: 'none' })
        }
      }
    })
  },

  showMultiConfirmDialog(records, rawText) {
    const summary = records.map((record) => {
      const typeLabel = getTypeLabel(record.type)
      const details = [
        record.itemName,
        record.feedingType,
        record.side ? getSideLabel(record.side) : '',
        this.buildConfirmAmountText(record),
        record.duration ? `${record.duration}分钟` : '',
        record.recordTime
      ].filter(Boolean).join(' ')
      return `${typeLabel}: ${details}`
    }).join('\n')

    wx.showModal({
      title: `确认记录 ${records.length} 条？`,
      content: summary || rawText,
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await this.saveRecords(records, 'miniprogram')
          this.setData({ voiceText: '' })
          wx.showToast({ title: `已记录 ${records.length} 条`, icon: 'none' })
          this.loadData()
        } catch (err) {
          wx.showToast({ title: `保存失败: ${err.message}`, icon: 'none' })
        }
      }
    })
  },

  async saveRecords(records, source) {
    const tasks = records.map((record) => callApi('addRecord', {
      record: {
        type: record.type,
        itemName: record.itemName,
        amount: record.amount,
        unit: record.unit,
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

  getNowTimeStr() {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  },

  quickRecord(e) {
    const type = e.currentTarget.dataset.type
    const titleMap = {
      breastfeeding: '亲喂',
      bottle: '瓶喂',
      food: '辅食',
      supplement: '补剂',
      medicine: '药物',
      outdoor: '户外',
      swimming: '游泳',
      diaper: '换尿布'
    }

    if (type === 'diaper') {
      wx.showModal({
        title: '记录换尿布',
        content: '确认记录一次换尿布？',
        success: async (res) => {
          if (!res.confirm) return
          try {
            await callApi('addRecord', { record: { type: 'diaper', source: 'miniprogram' } })
            wx.showToast({ title: '已记录', icon: 'none' })
            this.loadData()
          } catch (err) {
            wx.showToast({ title: `保存失败: ${err.message}`, icon: 'none' })
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
      quickSide: 'left',
      quickBottleType: '奶粉',
      quickItemName: 'AD',
      quickUnit: 'ml',
      quickTimeStr: this.getNowTimeStr(),
      quickNote: '',
      quickEvent: ''
    })
  },

  selectAmount(e) {
    this.setData({ quickAmount: `${e.currentTarget.dataset.amount}` })
  },

  selectDuration(e) {
    this.setData({ quickDuration: `${e.currentTarget.dataset.duration}` })
  },

  selectSide(e) {
    this.setData({ quickSide: e.currentTarget.dataset.side })
  },

  selectBottleType(e) {
    this.setData({ quickBottleType: e.currentTarget.dataset.btype })
  },

  selectQuickItemName(e) {
    this.setData({ quickItemName: e.currentTarget.dataset.name })
  },

  selectQuickUnit(e) {
    this.setData({ quickUnit: e.currentTarget.dataset.unit })
  },

  onAmountInput(e) {
    this.setData({ quickAmount: e.detail.value })
  },

  onDurationInput(e) {
    this.setData({ quickDuration: e.detail.value })
  },

  onQuickItemNameInput(e) {
    this.setData({ quickItemName: e.detail.value })
  },

  onQuickEventInput(e) {
    this.setData({ quickEvent: e.detail.value })
  },

  onQuickTimeChange(e) {
    this.setData({ quickTimeStr: e.detail.value })
  },

  onQuickNoteInput(e) {
    this.setData({ quickNote: e.detail.value })
  },

  async submitQuickRecord() {
    const {
      quickModalType,
      quickAmount,
      quickDuration,
      quickSide,
      quickBottleType,
      quickItemName,
      quickUnit,
      quickTimeStr,
      quickNote,
      quickEvent
    } = this.data

    let record = {
      source: 'miniprogram',
      recordTime: quickTimeStr ? this.parseRecordTime(quickTimeStr) : undefined
    }

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
    } else if (quickModalType === 'supplement') {
      const amount = parseFloat(quickAmount)
      if (!amount || amount <= 0) {
        wx.showToast({ title: '请输入用量', icon: 'none' })
        return
      }
      record = { ...record, type: 'supplement', itemName: quickItemName, unit: quickUnit, amount }
    } else if (quickModalType === 'medicine') {
      const amount = parseFloat(quickAmount)
      if (!quickItemName.trim()) {
        wx.showToast({ title: '请输入药物名称', icon: 'none' })
        return
      }
      if (!amount || amount <= 0) {
        wx.showToast({ title: '请输入用量', icon: 'none' })
        return
      }
      record = {
        ...record,
        type: 'medicine',
        itemName: quickItemName.trim(),
        unit: quickUnit,
        amount,
        note: quickNote || ''
      }
    } else if (quickModalType === 'outdoor') {
      if (!quickEvent.trim()) {
        wx.showToast({ title: '请输入户外事件', icon: 'none' })
        return
      }
      record = {
        ...record,
        type: 'outdoor',
        itemName: quickEvent.trim(),
        note: quickNote || ''
      }
    }

    try {
      await callApi('addRecord', { record })
      this.setData({ showQuickModal: false })
      wx.showToast({ title: '记录成功', icon: 'none' })
      this.loadData()
    } catch (err) {
      wx.showToast({ title: `保存失败: ${err.message}`, icon: 'none' })
    }
  },

  closeModal() {
    this.setData({ showQuickModal: false })
  },

  async confirmRecord(e) {
    const id = e.currentTarget.dataset.id
    try {
      await callApi('updateRecord', { id, record: { status: 'confirmed' } })
      wx.showToast({ title: '已确认', icon: 'none' })
      this.loadData()
    } catch (err) {
      wx.showToast({ title: `确认失败: ${err.message}`, icon: 'none' })
    }
  },

  async deleteRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后可在 7 天内恢复',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await callApi('deleteRecord', { id })
          wx.showToast({ title: '已删除', icon: 'none' })
          this.loadData()
        } catch (err) {
          wx.showToast({ title: `删除失败: ${err.message}`, icon: 'none' })
        }
      }
    })
  },

  editRecord(e) {
    const id = e.currentTarget.dataset.id
    getApp().globalData.editRecordId = id
    wx.switchTab({ url: '/pages/record/record' })
  },

  goBabyProfile() {
    wx.navigateTo({ url: '/pages/baby-profile/index' })
  },

  goRecord() {
    wx.switchTab({ url: '/pages/record/record' })
  },

  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' })
  },

  onVoiceRecordSuccess() {
    this.loadData()
  }
})
