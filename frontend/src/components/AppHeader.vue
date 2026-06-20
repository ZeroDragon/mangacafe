<template lang="pug">
header.app-header
  .brand Manga Café
  .spacer
  .user(v-if="username")
    span.material-symbols-outlined.icon person
    span.name {{ username }}
    button.logout(@click="logout")
      span.material-symbols-outlined.icon logout
      span Salir
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
  padding 12px 16px
  background-color var(--primary)
  color #fff
  .brand
    font-weight 600
    letter-spacing 0.5px
  .spacer
    flex 1
  .user
    display flex
    align-items center
    gap 8px
    .name
      opacity 0.9
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
</style>
