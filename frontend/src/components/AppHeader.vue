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
    router-link(:to="{ path: '/crunchyroll' }")
      span.material-symbols-outlined sync
      span.label Crunchyroll
  .spacer
  button.add(@click="$router.push('/series/new')")
    span.material-symbols-outlined add
    span.label New
  .user(v-if="username")
    span.material-symbols-outlined.icon person
    span.name {{ username }}
    button.logout(@click="logout")
      span.material-symbols-outlined.icon logout
      span.label Logout
</template>

<script>
import api from '../api.js'

export default {
  name: 'AppHeader',
  data () {
    return { username: '' }
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
  },
  methods: {
    logout () {
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
  .user
    display flex
    align-items center
    gap 8px
    .name
      opacity 0.9
      font-size 14px
    .icon
      font-size 20px
    .logout
      display inline-flex
      align-items center
      gap 4px
      background transparent
      border 1px solid rgba(255,255,255,0.4)
      color #fff
      padding 4px 10px
      border-radius 6px
      cursor pointer
      font-size 13px
      &:hover
        background rgba(255,255,255,0.15)
// En viewports chicos, ocultamos labels textuales y dejamos solo iconos.
@media (max-width 560px)
  .app-header
    .links a .label, .add .label, .logout .label, .user .name
      display none
    .brand .logo + span
      display none
</style>
