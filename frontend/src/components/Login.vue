<template lang="pug">
.login
  h1 Manga Café
  .card
    .tabs
      button(:class="{ active: mode === 'login' }" @click="setMode('login')") Sign in
      button(:class="{ active: mode === 'signup' }" @click="setMode('signup')") Create account
    form(@submit.prevent="submit")
      label
        span Username
        input(v-model="username" type="text" autocomplete="username" required)
      label
        span Password
        input(
          v-model="password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          required)
      button(type="submit" :disabled="loading")
        | {{ mode === 'login' ? 'Sign in' : 'Sign up' }}
      p.error(v-if="error") {{ error }}
</template>

<script>
import api from '../api.js'

export default {
  name: 'Login',
  data () {
    return {
      mode: 'login',
      username: '',
      password: '',
      loading: false,
      error: ''
    }
  },
  methods: {
    setMode (mode) {
      this.mode = mode
      this.error = ''
    },
    async submit () {
      this.loading = true
      this.error = ''
      try {
        if (this.mode === 'signup') {
          const res = await api.post('/api/signup', {
            username: this.username,
            password: this.password
          })
          if (res.data.error) {
            this.error = res.data.error
            return
          }
        }
        await api.post('/api/login', {
          username: this.username,
          password: this.password
        })
        this.$router.push('/dashboard')
      } catch (e) {
        this.error = (e.response && e.response.data && e.response.data.error) || 'Unexpected error'
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style lang="stylus" scoped>
.login
  max-width 360px
  margin 60px auto
  text-align center
  h1
    font-weight 300
    margin-bottom 24px
.card
  background rgba(255,255,255,0.04)
  border 1px solid rgba(255,255,255,0.08)
  border-radius 10px
  padding 20px
  text-align left
.tabs
  display flex
  margin-bottom 16px
  border-bottom 1px solid rgba(255,255,255,0.08)
  button
    flex 1
    background transparent
    border none
    color var(--foreground)
    padding 10px
    cursor pointer
    opacity 0.6
    border-bottom 2px solid transparent
    &.active
      opacity 1
      border-bottom-color var(--primary)
form
  display flex
  flex-direction column
  gap 12px
label
  display flex
  flex-direction column
  gap 4px
  font-size 13px
  opacity 0.85
input
  background rgba(0,0,0,0.25)
  border 1px solid rgba(255,255,255,0.1)
  border-radius 6px
  padding 8px 10px
  color var(--foreground)
  font-size 14px
  &:focus
    outline none
    border-color var(--primary)
button[type="submit"]
  margin-top 4px
  background var(--primary)
  border none
  color #fff
  padding 10px
  border-radius 6px
  cursor pointer
  font-size 14px
  &:disabled
    opacity 0.5
    cursor not-allowed
.error
  color var(--danger)
  margin 0
  font-size 13px
  text-align center
</style>
