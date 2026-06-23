<template lang="pug">
header.app-header
  router-link.brand(:to="{ path: '/dashboard' }")
    span.material-symbols-outlined.logo local_cafe
    span Manga Café
  nav.links
    router-link(:to="{ path: '/dashboard' }")
      span.material-symbols-outlined dashboard
      span.label Dashboard
    router-link(:to="{ path: '/series' }")
      span.material-symbols-outlined library_books
      span.label Series
    router-link(:to="{ path: '/reels' }")
      span.material-symbols-outlined smart_display
      span.label Reels
  .spacer
  button.add(@click="$router.push('/series/new')")
    span.material-symbols-outlined add
    span.label New
  .user-menu(v-if="username" ref="userMenu")
    button.user-trigger(@click="menuOpen = !menuOpen" :aria-expanded="menuOpen")
      span.material-symbols-outlined.icon person
      span.name {{ username }}
      span.material-symbols-outlined.arrow {{ menuOpen ? 'expand_less' : 'expand_more' }}
    .user-dropdown(v-if="menuOpen")
      router-link(:to="{ path: '/crunchyroll' }" @click="menuOpen = false")
        span.material-symbols-outlined sync
        span Sync Crunchyroll
      button(@click="logout")
        span.material-symbols-outlined logout
        span Logout
</template>

<script>
import api from '../api.js'

export default {
  name: 'AppHeader',
  data () {
    return { username: '', menuOpen: false }
  },
  async mounted () {
    try {
      const res = await api.get('/api/me')
      this.username = res.data.username
    } catch (e) {
      // token inválido/expirado: limpiar y volver al login
      localStorage.removeItem('token')
      this.$router.push('/login')
    }
    document.addEventListener('click', this.onDocumentClick)
  },
  beforeUnmount () {
    document.removeEventListener('click', this.onDocumentClick)
  },
  methods: {
    onDocumentClick (e) {
      // Cierra el dropdown si el click no fue dentro del .user-menu.
      const menu = this.$el && this.$el.querySelector('.user-menu')
      if (menu && !menu.contains(e.target)) this.menuOpen = false
    },
    logout () {
      this.menuOpen = false
      localStorage.removeItem('token')
      this.$router.push('/login')
    }
  }
}
</script>

<style lang="stylus" scoped>
.app-header
  display flex
  align-items center
  gap 12px
  padding 10px 16px
  background-color var(--primary)
  color #fff
  flex-wrap wrap
  .brand
    display inline-flex
    align-items center
    gap 6px
    font-weight 600
    letter-spacing 0.3px
    .logo
      font-size 22px
  .links
    display flex
    gap 4px
    margin-left 8px
    a
      display inline-flex
      align-items center
      gap 4px
      font-size 14px
      opacity 0.75
      padding 6px 10px
      border-radius 6px
      .material-symbols-outlined
        font-size 18px
      &.router-link-active
        opacity 1
        background rgba(255,255,255,0.15)
      &:hover
        opacity 1
        background rgba(255,255,255,0.1)
  .spacer
    flex 1
  .add
    display inline-flex
    align-items center
    gap 4px
    background rgba(255,255,255,0.18)
    border 1px solid rgba(255,255,255,0.3)
    color #fff
    padding 6px 12px
    border-radius 6px
    cursor pointer
    font-size 14px
    &:hover
      background rgba(255,255,255,0.28)
    .material-symbols-outlined
      font-size 18px
  .user-menu
    position relative
    display inline-flex
    align-items center
    .user-trigger
      display inline-flex
      align-items center
      gap 6px
      background transparent
      border 1px solid rgba(255,255,255,0.3)
      color #fff
      padding 4px 10px
      border-radius 6px
      cursor pointer
      font-size 14px
      &:hover
        background rgba(255,255,255,0.1)
      .name
        opacity 0.9
        font-size 14px
      .icon
        font-size 20px
      .arrow
        font-size 18px
    .user-dropdown
      position absolute
      top calc(100% + 4px)
      right 0
      min-width 180px
      background var(--primary)
      border 1px solid rgba(255,255,255,0.3)
      border-radius 6px
      padding 4px
      z-index 100
      display flex
      flex-direction column
      gap 2px
      a, button
        display flex
        align-items center
        gap 8px
        background transparent
        border none
        color #fff
        padding 8px 10px
        border-radius 4px
        cursor pointer
        font-size 14px
        text-align left
        text-decoration none
        &:hover
          background rgba(255,255,255,0.15)
        .material-symbols-outlined
          font-size 18px
// En viewports chicos, ocultamos labels textuales y dejamos solo iconos.
@media (max-width 560px)
  .app-header
    .links a .label, .add .label, .user-menu .user-trigger .name
      display none
    .brand .logo + span
      display none
</style>
