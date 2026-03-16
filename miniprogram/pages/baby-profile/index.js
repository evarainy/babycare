const DEFAULT_BABY_PHOTO = '/assets/icons/default-avatar.png'

const createDefaultForm = () => ({
  name: '',
  birthday: '',
  gender: 'unknown',
  heightCm: '',
  weightG: '',
  note: ''
})

Page({
  data: {
    loading: true,
    saving: false,
    uploading: false,
    darkMode: false,
    isNew: true,
    photoUrl: DEFAULT_BABY_PHOTO,
    form: createDefaultForm()
  },

  onLoad() {
    this.syncDarkMode()
    this.loadProfile()
  },

  onShow() {
    this.syncDarkMode()
  },

  syncDarkMode() {
    const app = getApp()
    const darkMode = !!(app && app.globalData && app.globalData.darkMode)
    this.setData({ darkMode })
  },

  normalizeNumber(value) {
    if (value === '' || value === null || value === undefined) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  },

  buildForm(profile = {}) {
    return {
      name: profile.name || '',
      birthday: profile.birthday || '',
      gender: profile.gender || 'unknown',
      heightCm: profile.heightCm !== null && profile.heightCm !== undefined ? `${profile.heightCm}` : '',
      weightG: profile.weightG !== null && profile.weightG !== undefined ? `${profile.weightG}` : '',
      note: profile.note || ''
    }
  },

  async choosePhoto() {
    if (this.data.uploading || this.data.saving) return
    try {
      const chooseRes = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed']
      })
      const file = chooseRes && chooseRes.tempFiles && chooseRes.tempFiles[0]
      if (!file || !file.tempFilePath) return

      this.setData({ uploading: true })

      const suffixMatch = file.tempFilePath.match(/\.[^.]+$/)
      const suffix = suffixMatch ? suffixMatch[0] : '.jpg'
      const cloudPath = `baby-photos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${suffix}`

      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: file.tempFilePath
      })

      if (!uploadRes || !uploadRes.fileID) {
        throw new Error('未获取到图片地址')
      }

      this.setData({ photoUrl: uploadRes.fileID })
      wx.showToast({ title: '头像已上传', icon: 'none' })
    } catch (err) {
      if (err && (err.errMsg || '').includes('cancel')) return
      console.error('上传宝宝头像失败:', err)
      wx.showToast({ title: '上传失败，请重试', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  async loadProfile() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'baby-profile-api',
        data: { action: 'getProfile' }
      })
      const profile = res && res.result && res.result.data ? res.result.data.currentBaby : null
      this.setData({
        loading: false,
        isNew: !profile,
        photoUrl: (profile && (profile.photoViewUrl || profile.photoUrl)) || wx.getStorageSync('currentBabyPhoto') || DEFAULT_BABY_PHOTO,
        form: this.buildForm(profile || {})
      })
    } catch (err) {
      console.error('加载宝宝信息失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    }
  },

  onFieldChange(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onBirthdayChange(e) {
    this.setData({ 'form.birthday': e.detail.value })
  },

  selectGender(e) {
    this.setData({ 'form.gender': e.currentTarget.dataset.gender })
  },

  async submitProfile() {
    const { form, saving } = this.data
    if (saving) return

    if (!form.name.trim()) {
      wx.showToast({ title: '请输入宝宝姓名', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      await wx.cloud.callFunction({
        name: 'baby-profile-api',
        data: {
          action: 'saveProfile',
          profile: {
            name: form.name.trim(),
            birthday: form.birthday || '',
            gender: form.gender || 'unknown',
            heightCm: this.normalizeNumber(form.heightCm),
            weightG: this.normalizeNumber(form.weightG),
            note: form.note ? form.note.trim() : '',
            photoUrl: this.data.photoUrl && this.data.photoUrl !== DEFAULT_BABY_PHOTO ? this.data.photoUrl : ''
          }
        }
      })
      wx.showToast({ title: this.data.isNew ? '宝宝档案已创建' : '宝宝信息已更新', icon: 'none' })
      setTimeout(() => {
        wx.navigateBack({ delta: 1 })
      }, 500)
    } catch (err) {
      console.error('保存宝宝信息失败:', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
