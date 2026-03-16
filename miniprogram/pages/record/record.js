const { callApi, formatTimeHHMM, formatInterval, getTypeLabel, getTypeIconPath, getSideLabel, formatAmount } = require('../../utils/api')

const createDefaultForm = (timeStr = '') => ({
  type: 'breastfeeding',
  feedingType: '奶粉',
  side: 'left',
  itemName: 'AD',
  unit: 'ml',
  amount: '',
  duration: '',
  timeStr,
  note: ''
})

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
    form: createDefaultForm(),
    typeOptions: [
      { value: 'breastfeeding', label: '亲喂', icon: '/assets/icons/type-breastfeeding.svg' },
      { value: 'bottle', label: '瓶喂', icon: '/assets/icons/type-bottle.svg' },
      { value: 'food', label: '辅食', icon: '/assets/icons/type-food.svg' },
      { value: 'supplement', label: '补剂', icon: '/assets/icons/type-supplement.svg' },
      { value: 'medicine', label: '药物', icon: '/assets/icons/type-medicine.svg' },
      { value: 'outdoor', label: '户外', icon: '/assets/icons/type-outdoor.svg' },
      { value: 'swimming', label: '游泳', icon: '/assets/icons/type-swimming.svg' },
      { value: 'diaper', label: '换尿布', icon: '/assets/icons/type-diaper.svg' },
      { value: 'sleep', label: '睡眠', icon: '/assets/icons/type-sleep.svg' },
      { value: 'other', label: '其他', icon: '/assets/icons/type-other.svg' }
    ],
    sideOptions: [
      { value: 'left', label: '左侧' },
      { value: 'right', label: '右侧' },
      { value: 'both', label: '双侧' }
    ],
    bottleTypeOptions: ['奶粉', '母乳', '水', '补剂'],
    supplementNameOptions: ['AD', 'D', '乳铁蛋白', '益生菌'],
    medicineUnitOptions: ['g', 'ml', '粒'],
    supplementUnitOptions: ['g', 'ml', '粒']
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

  async onPullDownRefresh() {
    this.syncDarkMode()
    try {
      await this.loadRecords()
    } finally {
      wx.stopPullDownRefresh()
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

  getNowTimeStr() {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  },

  formatRecord(record, i, arr) {
    const formatted = {
      ...record,
      typeLabel: getTypeLabel(record.type),
      typeIconPath: getTypeIconPath(record.type),
      sideLabel: getSideLabel(record.side),
      timeText: formatTimeHHMM(record.recordTime),
      amountText: this.getRecordAmountText(record)
    }
    const feedingTypes = ['breastfeeding', 'bottle']
    if (i < arr.length - 1 && feedingTypes.includes(record.type) && feedingTypes.includes(arr[i + 1].type)) {
      const diff = Math.abs(new Date(record.recordTime) - new Date(arr[i + 1].recordTime)) / 60000
      formatted.intervalText = formatInterval(Math.round(diff))
    }
    return formatted
  },

  getRecordAmountText(record) {
    if (record.type === 'supplement' || record.type === 'medicine') {
      if (record.amount === null || record.amount === undefined || record.amount === '') return ''
      return `${record.amount}${record.unit || ''}`
    }
    return formatAmount(record.amount, record.type)
  },

  async loadRecords() {
    try {
      const res = await callApi('getRecords', { date: this.data.currentDate })
      const records = res.data
        .filter((r) => r.status !== 'deleted')
        .map((r, i, arr) => this.formatRecord(r, i, arr))

      const feedingRecords = records.filter((r) => r.type === 'breastfeeding' || r.type === 'bottle')
      const totalAmount = feedingRecords.reduce((sum, r) => sum + (r.amount || 0), 0)

      let avgInterval = '--'
      if (feedingRecords.length > 1) {
        const intervals = []
        for (let i = 0; i < feedingRecords.length - 1; i += 1) {
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
    const record = this.data.records.find((r) => r._id === id)
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
    this.setData({
      showModal: true,
      editId: null,
      form: createDefaultForm(this.getNowTimeStr())
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
        side: record.side || 'left',
        itemName: record.itemName || (record.type === 'supplement' ? 'AD' : ''),
        unit: record.unit || 'ml',
        amount: record.amount !== null && record.amount !== undefined ? `${record.amount}` : '',
        duration: record.duration !== null && record.duration !== undefined ? `${record.duration}` : '',
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
    const timeStr = this.data.form.timeStr || this.getNowTimeStr()
    const defaults = {
      breastfeeding: { side: 'left', feedingType: '奶粉', itemName: 'AD', unit: 'ml', amount: '', duration: '', note: '', timeStr },
      bottle: { side: '', feedingType: '奶粉', itemName: 'AD', unit: 'ml', amount: '', duration: '', note: '', timeStr },
      food: { side: '', feedingType: '', itemName: '', unit: 'g', amount: '', duration: '', note: '', timeStr },
      supplement: { side: '', feedingType: '', itemName: 'AD', unit: 'ml', amount: '', duration: '', note: '', timeStr },
      medicine: { side: '', feedingType: '', itemName: '', unit: 'ml', amount: '', duration: '', note: '', timeStr },
      outdoor: { side: '', feedingType: '', itemName: '', unit: '', amount: '', duration: '', note: '', timeStr },
      swimming: { side: '', feedingType: '', itemName: '', unit: '', amount: '', duration: '', note: '', timeStr },
      diaper: { side: '', feedingType: '', itemName: '', unit: '', amount: '', duration: '', note: '', timeStr },
      sleep: { side: '', feedingType: '', itemName: '', unit: '', amount: '', duration: '', note: '', timeStr },
      other: { side: '', feedingType: '', itemName: '', unit: '', amount: '', duration: '', note: '', timeStr }
    }
    this.setData({
      'form.type': type,
      ...Object.fromEntries(Object.entries(defaults[type] || {}).map(([k, v]) => [`form.${k}`, v]))
    })
  },

  selectFeedingType(e) {
    this.setData({ 'form.feedingType': e.currentTarget.dataset.type })
  },

  selectSide(e) {
    this.setData({ 'form.side': e.currentTarget.dataset.side })
  },

  selectPresetAmount(e) {
    this.setData({ 'form.amount': `${e.currentTarget.dataset.amount}` })
  },

  selectPresetDuration(e) {
    this.setData({ 'form.duration': `${e.currentTarget.dataset.duration}` })
  },

  selectItemName(e) {
    this.setData({ 'form.itemName': e.currentTarget.dataset.name })
  },

  selectUnit(e) {
    this.setData({ 'form.unit': e.currentTarget.dataset.unit })
  },

  onAmountChange(e) {
    this.setData({ 'form.amount': e.detail.value })
  },

  onDurationChange(e) {
    this.setData({ 'form.duration': e.detail.value })
  },

  onItemNameChange(e) {
    this.setData({ 'form.itemName': e.detail.value })
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
    const amount = form.amount ? parseFloat(form.amount) : null
    const duration = form.duration ? parseInt(form.duration, 10) : null

    if (form.type === 'breastfeeding' && (!duration || duration <= 0)) {
      wx.showToast({ title: '请输入亲喂时长', icon: 'none' })
      return
    }

    if (['bottle', 'food', 'supplement', 'medicine'].includes(form.type) && (!amount || amount <= 0)) {
      wx.showToast({ title: '请输入用量', icon: 'none' })
      return
    }

    if (form.type === 'supplement' && !form.itemName) {
      wx.showToast({ title: '请选择补剂名称', icon: 'none' })
      return
    }

    if (form.type === 'medicine' && !form.itemName.trim()) {
      wx.showToast({ title: '请输入药物名称', icon: 'none' })
      return
    }

    if (form.type === 'outdoor' && !form.itemName.trim()) {
      wx.showToast({ title: '请输入户外事件', icon: 'none' })
      return
    }

    const record = {
      type: form.type,
      feedingType: form.type === 'bottle' ? form.feedingType || null : null,
      side: form.type === 'breastfeeding' ? form.side || null : null,
      itemName: ['supplement', 'medicine', 'outdoor'].includes(form.type) ? form.itemName || null : null,
      unit: ['supplement', 'medicine'].includes(form.type) ? form.unit || null : null,
      amount,
      duration: ['breastfeeding', 'swimming', 'sleep'].includes(form.type) ? duration : null,
      note: form.note || '',
      recordTime: recordTime.getTime(),
      source: 'miniprogram'
    }

    try {
      if (editId) {
        await callApi('updateRecord', { id: editId, record })
        wx.showToast({ title: '更新成功', icon: 'none' })
      } else {
        await callApi('addRecord', { record })
        wx.showToast({ title: '记录成功', icon: 'none' })
      }
      this.setData({ showModal: false })
      this.loadRecords()
    } catch (err) {
      wx.showToast({ title: `保存失败: ${err.message}`, icon: 'none' })
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
            wx.showToast({ title: `删除失败: ${err.message}`, icon: 'none' })
          }
        }
      }
    })
  },

  onVoiceRecordSuccess() {
    this.loadRecords()
  }
})
