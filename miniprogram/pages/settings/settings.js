const { callApi } = require('../../utils/api')

Page({
  data: {
    userInfo: {},
    familyId: '',
    familyMembers: [],
    botBound: false,
    darkMode: false,
    showInviteModal: false,
    showJoinModal: false,
    inviteCode: '',
    joinCode: '',
    apiUrl: 'https://YOUR_CLOUD_ENV.service.tcloudbase.com/babycare-api',
    babies: [],
    currentBabyId: '',
    showBabyModal: false,
    editingBabyId: '',
    babyForm: { name: '', birthday: '', weightG: '', heightCm: '', photoUrl: '' },
    roleOptions: ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '月嫂', '其他'],
    roleIndex: 7
  },

  onLoad() {
    const app = getApp()
    const cloudEnv = app.globalData.cloudEnv || 'YOUR_CLOUD_ENV'
    this.setData({ apiUrl: `https://${cloudEnv}.service.tcloudbase.com/babycare-api` })
    const darkMode = !!wx.getStorageSync('darkMode')
    this.setData({ darkMode })
    this.loadUserInfo()
    this.loadFamilyMembers()
    this.loadBabies()
    this.prepareInviteCode()
  },

  async loadUserInfo() {
    try {
      const res = await callApi('getUserInfo')
      if (res.code === 0) {
        const app = getApp()
        this.setData({
          userInfo: res.data,
          familyId: res.data.familyId,
          babies: res.data.babies || this.data.babies,
          currentBabyId: res.data.currentBabyId || this.data.currentBabyId
        })
        const roleOptions = this.data.roleOptions || []
        const idx = Math.max(0, roleOptions.indexOf((res.data && res.data.role) || '其他'))
        this.setData({ roleIndex: idx })
        app.globalData.userInfo = res.data
        app.globalData.familyId = res.data.familyId
      }
    } catch (err) {
      console.error('加载用户信息失败:', err)
    }
  },

  async loadFamilyMembers() {
    try {
      const res = await callApi('getFamilyMembers')
      if (res.code === 0) {
        this.setData({ familyMembers: res.data })
      }
    } catch (err) {
      console.error('加载家庭成员失败:', err)
    }
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail && e.detail.avatarUrl
    if (!avatarUrl) return
    this.setData({ 'userInfo.avatarUrl': avatarUrl })
  },

  onNickNameBlur(e) {
    const val = (e.detail && e.detail.value) || ''
    if (!val) return
    this.setData({ 'userInfo.nickName': val })
  },

  onRoleChange(e) {
    const idx = Number(e.detail.value || 0)
    const role = this.data.roleOptions[idx] || '其他'
    this.setData({ roleIndex: idx, 'userInfo.role': role })
  },

  async saveProfile() {
    const role = this.data.roleOptions[this.data.roleIndex] || this.data.userInfo.role || '其他'
    const payload = {
      nickName: this.data.userInfo.nickName || '宝宝家长',
      avatarUrl: this.data.userInfo.avatarUrl || '',
      role
    }
    try {
      const res = await callApi('updateUserInfo', { userInfo: payload })
      if (res.code === 0) {
        this.setData({ userInfo: { ...this.data.userInfo, ...payload } })
        wx.showToast({ title: '个人信息已保存', icon: 'none' })
      }
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  },


  async showInviteCode() {
    try {
      const res = await callApi('bindFamily', {})
      this.setData({
        showInviteModal: true,
        inviteCode: res.inviteCode
      })
    } catch (err) {
      wx.showToast({ title: '获取邀请码失败', icon: 'none' })
    }
  },

  closeInviteModal() {
    this.setData({ showInviteModal: false })
  },

  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: '已复制邀请码', icon: 'none' })
    })
  },

  showJoinFamily() {
    this.setData({ showJoinModal: true, joinCode: '' })
  },

  closeJoinModal() {
    this.setData({ showJoinModal: false })
  },

  onJoinCodeInput(e) {
    this.setData({ joinCode: e.detail.value.toUpperCase() })
  },

  async joinFamily() {
    const { joinCode } = this.data
    if (joinCode.length !== 6) {
      wx.showToast({ title: '请输入6位邀请码', icon: 'none' })
      return
    }
    try {
      const res = await callApi('bindFamily', { inviteCode: joinCode })
      if (res.code === 0) {
        wx.showToast({ title: '加入成功！', icon: 'none' })
        this.setData({ showJoinModal: false })
        await this.loadUserInfo()
        await this.loadFamilyMembers()
        await this.loadBabies()
      }
    } catch (err) {
      wx.showToast({ title: err.message || '加入失败', icon: 'none' })
    }
  },

  async loadBabies() {
    try {
      const res = await callApi('listBabies')
      if (res.code === 0) {
        this.setData({ babies: res.data.babies || [], currentBabyId: res.data.currentBabyId || '' })
      }
    } catch (err) {
      console.error('加载宝宝失败:', err)
      if ((err.message || '').includes('未知操作')) {
        try {
          const fallback = await callApi('getUserInfo')
          this.setData({
            babies: fallback.data?.babies || [],
            currentBabyId: fallback.data?.currentBabyId || ''
          })
          wx.showToast({ title: '请重新部署babycare-api云函数', icon: 'none' })
        } catch (fallbackErr) {
          console.error('加载宝宝降级失败:', fallbackErr)
        }
      }
    }
  },

  showAddBaby() {
    this.setData({
      showBabyModal: true,
      editingBabyId: '',
      babyForm: {
        name: '',
        birthday: this.formatDate(new Date()),
        weightG: '',
        heightCm: '',
        photoUrl: ''
      }
    })
  },

  editBaby(e) {
    const baby = e.currentTarget.dataset.baby
    this.setData({
      showBabyModal: true,
      editingBabyId: baby._id,
      babyForm: {
        name: baby.name || '',
        birthday: baby.birthday || this.formatDate(new Date()),
        weightG: baby.weightG || '',
        heightCm: baby.heightCm || '',
        photoUrl: baby.photoUrl || ''
      }
    })
  },

  closeBabyModal() {
    this.setData({ showBabyModal: false })
  },

  onBabyInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`babyForm.${key}`]: e.detail.value })
  },

  onBabyBirthdayChange(e) {
    this.setData({ 'babyForm.birthday': e.detail.value })
  },

  formatDate(date) {
    const y = date.getFullYear()
    const m = `${date.getMonth() + 1}`.padStart(2, '0')
    const d = `${date.getDate()}`.padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  async selectBabyPhoto() {
    try {
      const chooseSource = await new Promise((resolve, reject) => {
        wx.showActionSheet({
          itemList: ['拍照', '从相册选择'],
          success: (res) => resolve(res.tapIndex === 0 ? ['camera'] : ['album']),
          fail: reject
        })
      })

      const mediaRes = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: chooseSource,
          success: resolve,
          fail: reject
        })
      })

      const filePath = mediaRes.tempFiles?.[0]?.tempFilePath
      if (!filePath) return

      wx.showLoading({ title: '上传中', mask: true })
      const ext = (filePath.split('.').pop() || 'jpg').toLowerCase()
      const cloudPath = `baby-photos/${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath })

      this.setData({ 'babyForm.photoUrl': uploadRes.fileID || '' })
      wx.hideLoading()
      wx.showToast({ title: '上传成功', icon: 'none' })
    } catch (err) {
      wx.hideLoading()
      if (err && err.errMsg && err.errMsg.includes('cancel')) return
      wx.showToast({ title: '上传失败，请稍后重试', icon: 'none' })
    }
  },

  clearBabyPhoto() {
    this.setData({ 'babyForm.photoUrl': '' })
  },

  async saveBaby() {
    const payload = { ...this.data.babyForm }
    if (!payload.name || !payload.name.trim()) {
      wx.showToast({ title: '请输入宝宝姓名', icon: 'none' })
      return
    }

    if (this.data.editingBabyId) payload._id = this.data.editingBabyId

    try {
      const res = await callApi('saveBaby', { baby: payload })
      if (res.code === 0) {
        wx.showToast({ title: this.data.editingBabyId ? '更新成功' : '添加成功', icon: 'none' })
        this.setData({ showBabyModal: false })
        await this.loadBabies()
      }
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  },

  async deleteBaby(e) {
    const babyId = e.currentTarget.dataset.id
    if (!babyId) return
    const target = this.data.babies.find((b) => b._id === babyId)
    wx.showModal({
      title: '删除宝宝',
      content: `确认删除“${target?.name || '该宝宝'}”？删除后不可恢复。`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          const result = await callApi('deleteBaby', { babyId })
          wx.showToast({ title: '删除成功', icon: 'none' })
          this.setData({ currentBabyId: result.data?.currentBabyId || this.data.currentBabyId })
          await this.loadBabies()
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      }
    })
  },

  async switchBaby(e) {
    const babyId = e.currentTarget.dataset.id
    if (!babyId || babyId === this.data.currentBabyId) return
    try {
      const res = await callApi('setCurrentBaby', { babyId })
      if (res.code === 0) {
        this.setData({ currentBabyId: babyId })
        wx.showToast({ title: '已切换宝宝', icon: 'none' })
      }
    } catch (err) {
      wx.showToast({ title: err.message || '切换失败', icon: 'none' })
    }
  },

  showFamilyMembers() {
    const members = this.data.familyMembers
    const content = members.map(m => m.nickName || '未命名').join('、')
    wx.showModal({
      title: `家庭成员（${members.length}人）`,
      content: content || '暂无成员',
      showCancel: false
    })
  },

  showBotBindCode() {
    callApi('generateBotBindCode', {}).then(res => {
      const bindCode = (res.data && res.data.bindCode) || ''
      wx.showModal({
        title: '群机器人绑定码',
        content: `在微信群发送：\n绑定 ${bindCode}\n\n机器人将自动关联当前家庭和宝宝`,
        confirmText: '复制',
        success: (modalRes) => {
          if (modalRes.confirm) {
            wx.setClipboardData({
              data: `绑定 ${bindCode}`,
              success: () => wx.showToast({ title: '已复制', icon: 'none' })
            })
          }
        }
      })
    })
  },


  async prepareInviteCode() {
    if (this.data.inviteCode) return
    try {
      const res = await callApi('bindFamily', {})
      if (res && res.inviteCode) {
        this.setData({ inviteCode: res.inviteCode })
      }
    } catch (err) {
      console.error('预生成邀请码失败:', err)
    }
  },

  onTapShareInvite() {
    if (!this.data.inviteCode) {
      this.prepareInviteCode().then(() => {
        wx.showToast({ title: '邀请码已准备，请点击右上角分享', icon: 'none' })
      })
    }
  },

  onShareAppMessage() {
    const inviteCode = (this.data.inviteCode || '').toUpperCase()
    return {
      title: '邀请你加入宝宝喂养家庭',
      path: `/pages/index/index?inviteCode=${inviteCode}`
    }
  },

  copyApiUrl() {
    wx.setClipboardData({
      data: this.data.apiUrl,
      success: () => wx.showToast({ title: '已复制API地址', icon: 'none' })
    })
  },

  toggleDarkMode(e) {
    const darkMode = !!(e.detail && e.detail.value)
    this.setData({ darkMode })
    wx.setStorageSync('darkMode', darkMode)
    const app = getApp()
    app.globalData.darkMode = darkMode
    wx.showToast({ title: darkMode ? '已启用深色模式' : '已关闭深色模式', icon: 'none' })
  },

  exportData() {
    wx.showModal({
      title: '导出数据',
      content: '将导出最近30天的喂养记录为CSV格式，发送到您的邮箱',
      confirmText: '确认导出',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '功能开发中', icon: 'none' })
        }
      }
    })
  },

  showPrivacy() {
    wx.showModal({
      title: '隐私说明',
      content: '所有数据加密存储于您的腾讯云账号，我们无法查看您的任何数据。数据仅用于家庭喂养记录，不会用于任何商业目的。您可随时在设置中导出或删除所有数据。',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  onVoiceRecordSuccess() {
    wx.showToast({ title: '已记录', icon: 'none' })
  },
})
