<template lang="pug">
.userSection
  .template(v-if="userLoaded")
    span Welcome back, {{username}}
    .icons
      .sync
        span Sync {{progress}}
        tooltip.icon(@click="syncUp" v-if="canUpload" position="up" text="Upload")
          span.material-symbols-outlined cloud_upload
        tooltip.icon(@click="syncDown" position="up" text="Download")
          span.material-symbols-outlined cloud_download
      .icon(@click="logout")
        span Logout&nbsp;
        span.material-symbols-outlined logout
  template(v-else)
    span Create an account to sync your progress between devices (this feature will be free while in development, bear in mind that data loss is possible while in beta)
    .error(v-if="errorMessage") {{errorMessage}}
    input(v-model="username", placeholder="Username")
    input(v-model="password", placeholder="Password" type="password" @keyup.enter="submit")
    template(v-if="register")
      input(v-model="phone", placeholder="Phone number" type="phone")
    .buttons
      span.button(@click="submit") {{register ? 'Register' : 'Login'}}
      span(@click="toggleRegister") {{register ? 'I already have an account' : 'Need an account?'}}
    details(v-if="register")
      summary Important notice for lost passwords
      div We will only use your phone to send you a code to reset your password using <span class="important">TELEGRAM</span>. And we don't validate it in any way. If you enter a wrong number, you won't be able to reset your password in case you forget it. Make sure that your phone number is in international format. Example: +1234567890
    a(v-else :href="'https://t.me/' + botName" target="_blank") Click here to reset your password.
</template>
<style lang="stylus" scoped>
span
  font-size 14px
  color var(--foreground)
input
  display block
  width 100%
  font-size 14px
  padding: 4px 10px
  outline none
  border 1px solid rgba(255, 255, 255, 0.1)
  background-color transparent
  border-radius: 20px
  color var(--foreground)
  margin-bottom 5px
.buttons
  display flex
  justify-content space-between
  span
    border 1px transparent
    &.button
      border 1px solid rgba(255, 255, 255, 0.1)
      &:hover
        background-color rgba(255, 255, 255, 0.1)
    cursor pointer
    padding: 4px 10px
    border-radius: 20px
a
  text-align center
  display block
  font-size 14px
  margin-top 10px
.error
  color var(--danger)
  font-size 14px
  margin-bottom 10px
details
  margin-top 10px
  summary
    cursor pointer
    font-size 14px
    color var(--danger)
  div
    font-size 12px
    color var(--foreground)
    .important
      font-weight bold
      color var(--foreground)
      background-color var(--primary)
.icons
  display flex
  justify-content space-between
  margin-top: 10px
  .icon
    cursor pointer
    display flex
    align-items center
    font-size 14px
.sync
  display flex
  align-items center
  .icon
    margin-left 10px
</style>
<script>
import axios from 'axios'
import { sync } from '../storage.js'
import tooltip from './tooltip.vue'
export default {
  data() {
    return {
      username: '',
      password: '',
      phone: '',
      register: false,
      errorMessage: '',
      botName: __BOT_NAME__,
      userLoaded: false,
      progress: ''
    }
  },
  computed: {
    canUpload() {
      return localStorage.appMemory
    }
  },
  methods: {
    async submit() {
      this.errorMessage = ''
      const option = this.register ? 'signup' : 'login'
      const response = await new Promise(resolve => {
        axios.post(`${__API__}/${option}`, {
          username: this.username,
          password: this.password,
          phone: this.phone
        })
        .then(resolve)
        .catch(({ response }) => resolve(response))
      })
      if (response.data.error) this.errorMessage = response.data.error
      if (response.data.success) {
        if (option === 'signup') {
          this.register = false
          return this.submit()
        }
        localStorage.token = response.data.token
        localStorage.username = this.username
        this.userLoaded = true
      }
    },
    toggleRegister() {
      this.register = !this.register
    },
    logout() {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      this.userLoaded = false
    },
    async syncUp () {
      this.progress = '10%'
      if (!localStorage.appMemory) return
      const response = await sync.upload()
      this.afterSync(response.error)
    },
    async syncDown () {
      this.progress = '10%'
      const response = await sync.download()
      this.afterSync(response.error, true)
    },
    afterSync (error, download) {
      this.progress = '50%'
      if (error) {
        this.errorMessage = error
        this.progress = 'not successful'
        setTimeout(() => this.progress = '', 5000)
        return
      }
      this.progress = '100%'
      if (download) document.location.reload()
      setTimeout(() => this.progress = '', 5000)
    }
  },
  beforeMount() {
    const token = localStorage.token
    if (token) {
      this.userLoaded = true
      this.username = localStorage.username
    }
  },
  components: {
    tooltip
  }
}
</script>
