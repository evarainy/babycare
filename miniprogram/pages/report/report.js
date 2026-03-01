const { callApi, formatInterval } = require('../../utils/api')

Page({
  data: {
    period: '7d',
    periodLabel: '近7天',
    periodOptions: [
      { value: '7d', label: '近7天' },
      { value: '14d', label: '近14天' },
      { value: '30d', label: '近30天' }
    ],
    report: {
      days: [],
      summary: { totalCount: 0, totalAmount: 0, avgDailyAmount: 0, avgDailyCount: 0, avgIntervalMinutes: null }
    },
    chartData: [],
    avgIntervalText: '--',
    insights: [],
    darkMode: false
  },

  onLoad() {
    this.syncDarkMode()
    this.loadReport()
  },

  onShow() {
    this.syncDarkMode()
    this.loadReport()
  },

  syncDarkMode() {
    const app = getApp()
    const darkMode = !!(app && app.globalData && app.globalData.darkMode)
    this.setData({ darkMode })
  },

  selectPeriod(e) {
    const period = e.currentTarget.dataset.period
    const labelMap = { '7d': '近7天', '14d': '近14天', '30d': '近30天' }
    this.setData({ period, periodLabel: labelMap[period] })
    this.loadReport()
  },

  async loadReport() {
    const { period } = this.data
    const days = parseInt(period)
    const endDate = this.getDateStr(new Date())
    const startDate = this.getDateStr(new Date(Date.now() - (days - 1) * 86400000))

    try {
      const res = await callApi('getReport', { startDate, endDate })
      const report = res.data

      const maxAmount = Math.max(...report.days.map(d => d.totalAmount), 1)
      const chartData = report.days.map(d => ({
        ...d,
        dateLabel: d.date.slice(5),
        heightPercent: Math.round((d.totalAmount / maxAmount) * 100),
        amountPercent: Math.round((d.totalAmount / maxAmount) * 100)
      }))

      const avgIntervalText = formatInterval(report.summary.avgIntervalMinutes)
      const insights = this.generateInsights(report)

      this.setData({ report, chartData, avgIntervalText, insights })
    } catch (err) {
      console.error('加载报表失败:', err)
    }
  },

  generateInsights(report) {
    const insights = []
    const { summary, days } = report

    if (summary.avgDailyCount > 0) {
      insights.push({
        icon: '🍼',
        text: `平均每天喂养 ${summary.avgDailyCount} 次，总奶量 ${summary.avgDailyAmount}ml`
      })
    }

    if (summary.avgIntervalMinutes) {
      const h = Math.floor(summary.avgIntervalMinutes / 60)
      const m = summary.avgIntervalMinutes % 60
      const intervalStr = h > 0 ? `${h}小时${m}分钟` : `${m}分钟`
      insights.push({
        icon: '⏰',
        text: `平均喂养间隔 ${intervalStr}`
      })
    }

    const recentDays = days.slice(-3)
    const olderDays = days.slice(0, -3)
    if (recentDays.length > 0 && olderDays.length > 0) {
      const recentAvg = recentDays.reduce((s, d) => s + d.totalAmount, 0) / recentDays.length
      const olderAvg = olderDays.reduce((s, d) => s + d.totalAmount, 0) / olderDays.length
      if (recentAvg > olderAvg * 1.1) {
        insights.push({ icon: '📈', text: '近3天奶量有所增加，宝宝胃口不错！' })
      } else if (recentAvg < olderAvg * 0.9) {
        insights.push({ icon: '📉', text: '近3天奶量略有减少，注意观察宝宝状态' })
      }
    }

    const zerodays = days.filter(d => d.count === 0).length
    if (zerodays > 0) {
      insights.push({ icon: '⚠️', text: `有 ${zerodays} 天记录为空，可能有漏记` })
    }

    return insights
  },

  getDateStr(date) {
    const y = date.getFullYear()
    const m = (date.getMonth() + 1).toString().padStart(2, '0')
    const d = date.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  onShareAppMessage() {
    return {
      title: '宝宝成长手记 - 喂养记录',
      path: '/pages/index/index'
    }
  },

  onVoiceRecordSuccess() {
    this.loadReport()
  },
})
