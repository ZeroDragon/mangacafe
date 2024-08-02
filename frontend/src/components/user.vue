<template lang="pug">
.userSection
  .template(v-if="userLoaded")
    span Welcome back, {{username}}
    .icons
      .icon(@click="sync")
        span.material-symbols-outlined cloud
        |&nbsp;Sync {{progress}}
      .icon(@click="logout")
        |Logout&nbsp;
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
      div We will only use your phone to send you a code to reset your password using <span class="important">TELEGRAM</span>. And we don't validate it in any way. If you enter a wrong number, you won't be able to reset your password in case you forget it. Make sure that your password is in international format. Example: +1234567890
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
</style>
<script>
import axios from 'axios'
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
    async sync() {
      this.progress = '10%'
      let response = await new Promise(resolve => {
        axios.get(`${__API__}/sync`, {
          headers: {
            Authorization: `Bearer ${localStorage.token}`
          }
        })
        .then(resolve)
        .catch(({ response }) => resolve(response))
      })
      if (response.data.error) {
        this.errorMessage = response.data.error
        this.progress = 'not successful'
        setTimeout(() => this.progress = '', 5000)
        return
      }
      this.progress = '50%'
      const remote = response.data.remote || {settings: '{}', last_updated: 0}
      const local = JSON.parse(localStorage.appMemory || '{}')
      if (!local.lastUpdated) local.lastUpdated = 0
      const remoteData = JSON.parse(remote.settings)
      const newData = remote.last_updated >= local.lastUpdated ? remoteData : local
      const oldData = remote.last_updated < local.lastUpdated ? remoteData : local
      const merged = {
        ...oldData,
        ...newData,
        lastUpdated: Math.max(remote.last_updated, local.lastUpdated)
      }
      localStorage.appMemory = JSON.stringify(merged)
      const lastUpdated = merged.lastUpdated
      delete merged.mangaLoaded
      delete merged.displaySettings
      delete merged.lastUpdated
      this.$storage.load()
      response = await new Promise(resolve => {
        axios.post(`${__API__}/sync`, {
          settings: JSON.stringify(merged),
          lastUpdated
        }, {
          headers: {
            Authorization: `Bearer ${localStorage.token}`
          }
        })
        .then(resolve)
        .catch(({ response }) => resolve(response))
      })
      if (response.data.error) {
        this.errorMessage = response.data.error
        this.progress = 'not successful'
        setTimeout(() => this.progress = '', 5000)
        return
      }
      this.progress = '100%'
      window.location.href = '/'
      setTimeout(() => this.progress = '', 5000)
    }
  },
  beforeMount() {
    const token = localStorage.token
    if (token) {
      this.userLoaded = true
      this.username = localStorage.username
    }
  }
}
</script>
