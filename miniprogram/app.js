App({
  globalData: {
    userInfo: null,
    familyId: null,
    openid: null,
    cloudEnv: '',
    editRecordId: null,
    pendingInviteCode: '',
    joiningFamily: false,
    darkMode: false
  },

  applyTabBarStyle(darkMode = false) {
    if (!wx.setTabBarStyle) return
    wx.setTabBarStyle({
      color: darkMode ? '#7E8A9D' : '#94A0B2',
      selectedColor: darkMode ? '#FFB6C9' : '#FF6B95',
      backgroundColor: darkMode ? '#121A26' : '#FFFFFF',
      borderStyle: darkMode ? 'black' : 'white'
    })
  },

  onLaunch(options) {
    this.globalData.darkMode = !!wx.getStorageSync('darkMode')
    this.applyTabBarStyle(this.globalData.darkMode)
    this.globalData.cloudEnv = this.resolveCloudEnv()

    const initOptions = {
      traceUser: true
    }
    if (this.globalData.cloudEnv) {
      initOptions.env = this.globalData.cloudEnv
    }

    wx.cloud.init({
      ...initOptions
    })
    this.captureInviteCode(options)
    this.initUser()
  },

  resolveCloudEnv() {
    const fromStorage = wx.getStorageSync('CLOUD_ENV_ID')
    if (fromStorage && typeof fromStorage === 'string') {
      return fromStorage.trim()
    }

    try {
      const ext = wx.getExtConfigSync ? wx.getExtConfigSync() : null
      const fromExt = ext && (ext.CLOUD_ENV_ID || ext.cloudEnv || ext.env)
      if (fromExt && typeof fromExt === 'string') {
        return fromExt.trim()
      }
    } catch (e) {}

    return ''
  },

  onShow(options) {
    this.captureInviteCode(options)
    this.applyTabBarStyle(this.globalData.darkMode)
    if (this.globalData.userInfo) {
      this.tryJoinFamilyByInvite()
    }
  },

  captureInviteCode(options) {
    const inviteCode = options && options.query && options.query.inviteCode
    if (inviteCode) {
      this.globalData.pendingInviteCode = String(inviteCode).toUpperCase()
    }
  },

  async initUser() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'babycare-api',
        data: { action: 'getUserInfo' }
      })
      if (res.result && res.result.code === 0) {
        this.globalData.userInfo = res.result.data
        this.globalData.familyId = res.result.data.familyId
        this.globalData.openid = res.result.data.openid
        await this.tryJoinFamilyByInvite()
      }
    } catch (err) {
      console.error('初始化用户失败:', err)
    }
  },

  async tryJoinFamilyByInvite() {
    const inviteCode = this.globalData.pendingInviteCode
    if (!inviteCode || this.globalData.joiningFamily) return

    this.globalData.joiningFamily = true
    try {
      const res = await wx.cloud.callFunction({
        name: 'babycare-api',
        data: {
          action: 'bindFamily',
          inviteCode
        }
      })

      if (res.result && res.result.code === 0) {
        this.globalData.pendingInviteCode = ''
        this.globalData.familyId = res.result.familyId || this.globalData.familyId
        wx.showToast({ title: '加入家庭成功', icon: 'none' })
        wx.switchTab({ url: '/pages/index/index' })
      }
    } catch (err) {
      console.error('分享邀请自动加入失败:', err)
    } finally {
      this.globalData.joiningFamily = false
    }
  }
})
