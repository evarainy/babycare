const { callApi, parseFeedingText } = require('../../utils/api')

const CANCEL_THRESHOLD = 50
const MAX_DURATION_MS = 60000
const MIN_DURATION_MS = 1000

Component({
  properties: {
    avatarUrl: {
      type: String,
      value: '/assets/icons/default-avatar.png'
    }
  },

  data: {
    isRecording: false,
    isCancelMode: false,
    hintText: '松开手指，发送',
    levelBars: [20, 34, 26, 40, 30]
  },

  lifetimes: {
    attached() {
      this.initRecognitionManager()
      this.syncAvatarFromGlobal()
    }
  },

  pageLifetimes: {
    show() {
      this.syncAvatarFromGlobal()
    }
  },

  methods: {
    noop() {},

    syncAvatarFromGlobal() {
      if (this.properties.avatarUrl && this.properties.avatarUrl !== '/assets/icons/default-avatar.png') {
        this.setData({ avatarUrl: this.properties.avatarUrl })
        return
      }
      const app = getApp()
      const babyPhoto = wx.getStorageSync('currentBabyPhoto') || (app && app.globalData && app.globalData.currentBabyPhoto)
      const userAvatar = app && app.globalData && app.globalData.userInfo && app.globalData.userInfo.avatarUrl
      this.setData({ avatarUrl: babyPhoto || userAvatar || '/assets/icons/default-avatar.png' })
    },

    initRecognitionManager() {
      try {
        const plugin = requirePlugin('WechatSI')
        const manager = plugin.getRecordRecognitionManager()
        this.manager = manager
        this.bindRecognitionHandlers()
      } catch (err) {
        console.warn('WechatSI插件不可用:', err)
        this.manager = null
      }
    },

    bindRecognitionHandlers() {
      if (!this.manager) return
      this.manager.onRecognize = () => this.animateBars()
      this.manager.onError = () => {
        this.stopRecordUI()
        wx.showToast({ title: '识别失败，请重试', icon: 'none' })
      }
      this.manager.onStop = async (res) => {
        const duration = Date.now() - (this.recordStartTime || Date.now())
        const shouldCancel = this.cancelOnStop
        if (shouldCancel) {
          wx.showToast({ title: '已取消', icon: 'none' })
          return
        }

        if (duration < MIN_DURATION_MS) {
          wx.showToast({ title: '识别失败，请重试', icon: 'none' })
          return
        }

        const text = (res && res.result) ? String(res.result).trim() : ''
        if (!text) {
          wx.showToast({ title: '识别失败，请重试', icon: 'none' })
          return
        }

        await this.parseAndConfirm(text)
      }
    },

    requestRecordScope() {
      return new Promise((resolve) => {
        wx.getSetting({
          success: (setting) => {
            const granted = !!setting.authSetting['scope.record']
            if (granted) {
              resolve(true)
              return
            }
            wx.authorize({
              scope: 'scope.record',
              success: () => resolve(true),
              fail: () => {
                wx.showModal({
                  title: '需要麦克风权限',
                  content: '请在设置中开启麦克风权限后继续语音录入。',
                  confirmText: '去设置',
                  success: (res) => {
                    if (res.confirm) {
                      wx.openSetting({
                        success: (openRes) => resolve(!!openRes.authSetting['scope.record']),
                        fail: () => resolve(false)
                      })
                    } else {
                      resolve(false)
                    }
                  }
                })
              }
            })
          },
          fail: () => resolve(false)
        })
      })
    },

    async onTouchStart(e) {
      if (this.data.isRecording) return
      if (!this.manager) {
        wx.showToast({ title: '识别失败，请重试', icon: 'none' })
        return
      }

      this.bindRecognitionHandlers()

      const granted = await this.requestRecordScope()
      if (!granted) return

      const touch = e.touches && e.touches[0]
      this.startY = touch ? touch.clientY : 0
      this.cancelOnStop = false
      this.recordStartTime = Date.now()

      this.setData({
        isRecording: true,
        isCancelMode: false,
        hintText: '松开手指，发送'
      })

      this.manager.start({
        lang: 'zh_CN',
        duration: MAX_DURATION_MS
      })

      this.barTimer = setInterval(() => this.animateBars(), 180)
      this.autoStopTimer = setTimeout(() => {
        if (this.data.isRecording) {
          this.finalizeStop(false)
        }
      }, MAX_DURATION_MS)
    },

    onTouchMove(e) {
      if (!this.data.isRecording) return
      const touch = e.touches && e.touches[0]
      if (!touch) return
      const moveDelta = this.startY - touch.clientY
      const toCancelMode = moveDelta > CANCEL_THRESHOLD
      if (toCancelMode !== this.data.isCancelMode) {
        this.setData({
          isCancelMode: toCancelMode,
          hintText: toCancelMode ? '松开手指，取消发送' : '松开手指，发送'
        })
      }
    },

    finalizeStop(shouldCancel) {
      if (!this.data.isRecording || !this.manager) return
      this.cancelOnStop = !!shouldCancel
      this.stopRecordUI()
      try {
        this.manager.stop()
      } catch (err) {
        wx.showToast({ title: '识别失败，请重试', icon: 'none' })
      }
    },

    onTouchEnd() {
      this.finalizeStop(this.data.isCancelMode)
    },

    onTouchCancel() {
      this.finalizeStop(true)
    },

    stopRecordUI() {
      this.setData({ isRecording: false, isCancelMode: false, hintText: '松开手指，发送' })
      clearInterval(this.barTimer)
      clearTimeout(this.autoStopTimer)
      this.barTimer = null
      this.autoStopTimer = null
    },

    animateBars() {
      const bars = [0, 0, 0, 0, 0].map(() => 16 + Math.floor(Math.random() * 28))
      this.setData({ levelBars: bars })
    },

    parseRecordTime(timeStr) {
      if (!timeStr) return undefined
      const [hour, minute] = String(timeStr).split(':').map(Number)
      if (Number.isNaN(hour) || Number.isNaN(minute)) return undefined
      const now = new Date()
      const recordDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute)
      return recordDate.getTime()
    },

    async parseAndConfirm(text) {
      wx.showLoading({ title: '识别中...' })
      try {
        const parseRes = await parseFeedingText(text)
        const parsed = parseRes && parseRes.data
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('识别失败')
        }

        wx.hideLoading()
        const summary = parsed.map((record) => {
          const parts = [
            record.type || '记录',
            record.feedingType || '',
            (record.amount || record.amount === 0) ? `${record.amount}${record.type === 'food' ? 'g' : 'ml'}` : '',
            record.duration ? `${record.duration}分钟` : '',
            record.side || '',
            record.recordTime || ''
          ].filter(Boolean)
          return parts.join(' ')
        }).join('\n')

        wx.showModal({
          title: `确认录入 ${parsed.length} 条？`,
          content: summary || text,
          confirmText: '确认',
          cancelText: '取消',
          success: async (res) => {
            if (!res.confirm) {
              wx.showToast({ title: '已取消', icon: 'none' })
              return
            }
            await this.saveParsedRecords(parsed)
          }
        })
      } catch (err) {
        wx.hideLoading()
        wx.showToast({ title: '识别失败，请重试', icon: 'none' })
      }
    },

    async saveParsedRecords(parsed) {
      try {
        const tasks = parsed.map((record) => callApi('addRecord', {
          record: {
            type: record.type,
            amount: record.amount,
            side: record.side,
            feedingType: record.feedingType,
            duration: record.duration,
            note: record.note || '',
            recordTime: record.recordTime ? this.parseRecordTime(record.recordTime) : undefined,
            source: 'miniprogram'
          }
        }))

        await Promise.all(tasks)
        wx.showToast({ title: '已记录', icon: 'none' })
        this.triggerEvent('recordsuccess')
      } catch (err) {
        wx.showToast({ title: '识别失败，请重试', icon: 'none' })
      }
    }
  }
})
