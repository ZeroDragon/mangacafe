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
      .mcaptcha-widget(v-if="mode === 'signup' && mcaptchaConfigured" ref="mcaptchaWidget")
        #mcaptcha__widget-container
      button(
        type="submit"
        :disabled="loading || (mode === 'signup' && !mcaptchaToken)")
        | {{ mode === 'login' ? 'Sign in' : 'Sign up' }}
      p.error(v-if="error") {{ error }}
      p.error(v-if="mode === 'signup' && !mcaptchaConfigured")
        | Signup is not available (captcha not configured).
</template>

<script>
import api from '../api.js'
import Widget from '@mcaptcha/vanilla-glue'

const MCAPTCHA_SITE_KEY = __MCAPTCHA_SITE_KEY__
const MCAPTCHA_INSTANCE = __MCAPTCHA_INSTANCE__

export default {
  name: 'Login',
  data () {
    return {
      mode: 'login',
      username: '',
      password: '',
      loading: false,
      error: '',
      mcaptchaToken: '',
      mcaptchaPoll: null
    }
  },
  computed: {
    mcaptchaConfigured () { return !!MCAPTCHA_SITE_KEY }
  },
  watch: {
    mode (next) {
      // Al cambiar a signup (re)inicializamos el widget; al volver a login limpiamos.
      this.mcaptchaToken = ''
      this.error = ''
      this.stopPolling()
      if (next === 'signup') this.$nextTick(() => this.mountMcaptcha())
    }
  },
  beforeUnmount () { this.stopPolling() },
  methods: {
    setMode (mode) { this.mode = mode },
    mountMcaptcha () {
      if (!MCAPTCHA_SITE_KEY) return
      const container = document.getElementById('mcaptcha__widget-container')
      if (!container) return
      // Limpiar instancias previas (iframe + input) para no duplicar al re-montar.
      container.innerHTML = ''
      try {
        new Widget({
          siteKey: { key: MCAPTCHA_SITE_KEY, instanceUrl: new URL(MCAPTCHA_INSTANCE) }
        })
      } catch (e) {
        console.error('[mcaptcha] mount failed:', e)
        return
      }
      this.startPolling()
    },
    startPolling () {
      this.stopPolling()
      // El widget escribe el token en un input oculto vía postMessage; no hay
      // callback público, así que lo sondeamos para habilitar el botón.
      this.mcaptchaPoll = setInterval(() => {
        const el = document.getElementById('mcaptcha__token')
        const val = el && el.value
        if (val && val !== this.mcaptchaToken) this.mcaptchaToken = val
      }, 250)
    },
    stopPolling () {
      if (this.mcaptchaPoll) { clearInterval(this.mcaptchaPoll); this.mcaptchaPoll = null }
    },
    resetCaptcha () {
      // El token es de un solo uso: tras un fallo hay que resolver otro.
      this.mcaptchaToken = ''
      this.$nextTick(() => this.mountMcaptcha())
    },
    async submit () {
      this.loading = true
      this.error = ''
      try {
        if (this.mode === 'signup') {
          await api.post('/api/signup', {
            username: this.username,
            password: this.password,
            mcaptcha_token: this.mcaptchaToken
          })
        }
        await api.post('/api/login', {
          username: this.username,
          password: this.password
        })
        this.$router.push('/dashboard')
      } catch (e) {
        this.error = (e.response && e.response.data && e.response.data.error) || 'Unexpected error'
        if (this.mode === 'signup') this.resetCaptcha()
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
.mcaptcha-widget
  min-height 70px
  display flex
  justify-content center
  margin -2px 0
#mcaptcha__widget-container
  width 100%
  min-height 64px
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
