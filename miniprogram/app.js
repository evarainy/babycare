App({
  globalData: {
    userInfo: null,
    familyId: null,
    openid: null,
    cloudEnv: 'cloudbase-4gwoq4vkebaa7cd3',
    editRecordId: null,
    pendingInviteCode: '',
    joiningFamily: false,
    darkMode: false
  },

  onLaunch(options) {
    this.globalData.darkMode = !!wx.getStorageSync('darkMode')
    wx.cloud.init({
      env: this.globalData.cloudEnv,
      traceUser: true
    })
    this.captureInviteCode(options)
    this.initUser()
  },

  onShow(options) {
    this.captureInviteCode(options)
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
