const { callApi, formatTimeHHMM, formatInterval, getTypeLabel, getTypeIcon, getSideLabel, formatAmount } = require('../../utils/api')
const app = getApp()

Page({
  data: {
    currentDate: '',
    isToday: true,
    records: [],
    daySummary: { count: 0, totalAmount: 0, avgInterval: '--' },
    showModal: false,
    darkMode: false,
    editId: null,
    _editing: false,
    form: {
      type: 'breastfeeding',
      feedingType: '奶粉',
      side: '左',
      amount: '',
      duration: '',
      timeStr: '',
      note: ''
    },
    typeOptions: [
      { value: 'breastfeeding', label: '亲喂', icon: '🤱' },
      { value: 'bottle', label: '瓶喂', icon: '🍼' },
      { value: 'food', label: '辅食', icon: '🥣' },
      { value: 'swimming', label: '游泳', icon: '🏊' },
      { value: 'diaper', label: '换尿布', icon: '👶' },
      { value: 'sleep', label: '睡眠', icon: '😴' },
      { value: 'other', label: '其他', icon: '📝' }
    ],
    sideOptions: [
      { value: '左', label: '左侧' },
      { value: '右', label: '右侧' },
      { value: '双', label: '双侧' }
    ],
    bottleTypeOptions: ['奶粉', '母乳', '水', '补剂']
  },

  onLoad(options) {
    this.syncDarkMode()
    const today = this.getDateStr(new Date())
    this.setData({ currentDate: today, isToday: true })

    if (options.id) {
      this.data._editing = true
      this.loadAndEditRecord(options.id)
    } else {
      this.loadRecords()
    }
  },

  onShow() {
    this.syncDarkMode()
    if (this.data._editing) {
      this.data._editing = false
      return
    }
    const app = getApp()
    const editId = app.globalData.editRecordId
    if (editId) {
      app.globalData.editRecordId = null
      this.loadAndEditRecord(editId)
    }
  },

  syncDarkMode() {
    const app = getApp()
    const darkMode = !!(app && app.globalData && app.globalData.darkMode)
    this.setData({ darkMode })
  },

  getDateStr(date) {
    const y = date.getFullYear()
    const m = (date.getMonth() + 1).toString().padStart(2, '0')
    const d = date.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  async loadRecords() {
    try {
      const res = await callApi('getRecords', { date: this.data.currentDate })
      const records = res.data
        .filter(r => r.status !== 'deleted')
        .map((r, i, arr) => {
          const formatted = {
            ...r,
            typeLabel: getTypeLabel(r.type),
            typeIcon: getTypeIcon(r.type),
            sideLabel: getSideLabel(r.side),
            timeText: formatTimeHHMM(r.recordTime),
            amountText: formatAmount(r.amount, r.type)
          }
          const feedingTypes = ['breastfeeding', 'bottle']
          if (i < arr.length - 1 && feedingTypes.includes(r.type) && feedingTypes.includes(arr[i + 1].type)) {
            const diff = Math.abs(new Date(r.recordTime) - new Date(arr[i + 1].recordTime)) / 60000
            formatted.intervalText = formatInterval(Math.round(diff))
          }
          return formatted
        })

      const feedingRecords = records.filter(r => r.type === 'breastfeeding' || r.type === 'bottle')
      const totalAmount = feedingRecords.reduce((sum, r) => sum + (r.amount || 0), 0)

      let avgInterval = '--'
      if (feedingRecords.length > 1) {
        const intervals = []
        for (let i = 0; i < feedingRecords.length - 1; i++) {
          const diff = Math.abs(new Date(feedingRecords[i].recordTime) - new Date(feedingRecords[i + 1].recordTime)) / 60000
          intervals.push(diff)
        }
        const avg = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        avgInterval = formatInterval(avg)
      }

      this.setData({
        records,
        daySummary: { count: feedingRecords.length, totalAmount, avgInterval }
      })
    } catch (err) {
      console.error('加载记录失败:', err)
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    }
  },

  async loadAndEditRecord(id) {
    await this.loadRecords()
    const record = this.data.records.find(r => r._id === id)
    if (record) {
      this.editRecord({ currentTarget: { dataset: { record } } })
    } else {
      wx.showToast({ title: '记录不存在或已删除', icon: 'none' })
    }
  },

  prevDay() {
    const current = new Date(this.data.currentDate)
    current.setDate(current.getDate() - 1)
    const dateStr = this.getDateStr(current)
    const today = this.getDateStr(new Date())
    this.setData({ currentDate: dateStr, isToday: dateStr === today })
    this.loadRecords()
  },

  nextDay() {
    if (this.data.isToday) return
    const current = new Date(this.data.currentDate)
    current.setDate(current.getDate() + 1)
    const dateStr = this.getDateStr(current)
    const today = this.getDateStr(new Date())
    this.setData({ currentDate: dateStr, isToday: dateStr === today })
    this.loadRecords()
  },

  onDateChange(e) {
    const dateStr = e.detail.value
    const today = this.getDateStr(new Date())
    this.setData({ currentDate: dateStr, isToday: dateStr === today })
    this.loadRecords()
  },

  showAddModal() {
    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    this.setData({
      showModal: true,
      editId: null,
      form: {
        type: 'breastfeeding',
        feedingType: '奶粉',
        side: '左',
        amount: '',
        duration: '',
        timeStr,
        note: ''
      }
    })
  },

  editRecord(e) {
    const record = e.currentTarget.dataset.record
    const d = new Date(record.recordTime)
    const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    this.setData({
      showModal: true,
      editId: record._id,
      form: {
        type: record.type || 'breastfeeding',
        feedingType: record.feedingType || '奶粉',
        side: record.side || '左',
        amount: record.amount ? record.amount.toString() : '',
        duration: record.duration ? record.duration.toString() : '',
        timeStr,
        note: record.note || ''
      }
    })
  },

  closeModal() {
    this.setData({ showModal: false })
  },

  selectType(e) {
    const type = e.currentTarget.dataset.type
    const defaults = {
      breastfeeding: { side: '左', feedingType: null, amount: '', duration: '' },
      bottle: { side: null, feedingType: '奶粉', amount: '', duration: '' },
      food: { side: null, feedingType: null, amount: '', duration: '' },
      swimming: { side: null, feedingType: null, amount: '', duration: '' },
      diaper: { side: null, feedingType: null, amount: '', duration: '' },
      sleep: { side: null, feedingType: null, amount: '', duration: '' },
      other: { side: null, feedingType: null, amount: '', duration: '' }
    }
    this.setData({ 'form.type': type, ...Object.fromEntries(Object.entries(defaults[type] || {}).map(([k, v]) => [`form.${k}`, v])) })
  },

  selectFeedingType(e) {
    this.setData({ 'form.feedingType': e.currentTarget.dataset.type })
  },

  selectSide(e) {
    this.setData({ 'form.side': e.currentTarget.dataset.side })
  },

  selectPresetAmount(e) {
    this.setData({ 'form.amount': e.currentTarget.dataset.amount.toString() })
  },

  selectPresetDuration(e) {
    this.setData({ 'form.duration': e.currentTarget.dataset.duration.toString() })
  },

  onAmountChange(e) {
    this.setData({ 'form.amount': e.detail.value })
  },

  onDurationChange(e) {
    this.setData({ 'form.duration': e.detail.value })
  },

  onTimeChange(e) {
    this.setData({ 'form.timeStr': e.detail.value })
  },

  onNoteChange(e) {
    this.setData({ 'form.note': e.detail.value })
  },

  noop() {},

  async submitRecord() {
    const { form, editId, currentDate } = this.data

    const recordTime = new Date(`${currentDate}T${form.timeStr || '00:00'}:00`)

    const record = {
      type: form.type,
      feedingType: form.feedingType || null,
      side: form.side || null,
      amount: form.amount ? parseFloat(form.amount) : null,
      duration: form.duration ? parseInt(form.duration, 10) : null,
      note: form.note || '',
      recordTime: recordTime.getTime(),
      source: 'miniprogram'
    }

    try {
      if (editId) {
        await callApi('updateRecord', { id: editId, record })
        wx.showToast({ title: '更新成功 ✓', icon: 'none' })
      } else {
        await callApi('addRecord', { record })
        wx.showToast({ title: '记录成功 ✓', icon: 'none' })
      }
      this.setData({ showModal: false })
      this.loadRecords()
    } catch (err) {
      wx.showToast({ title: '保存失败: ' + err.message, icon: 'none' })
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
            this.loadRecords()
          } catch (err) {
            wx.showToast({ title: '删除失败: ' + err.message, icon: 'none' })
          }
        }
      }
    })
  },

  onVoiceRecordSuccess() {
    this.loadRecords()
  },
})
