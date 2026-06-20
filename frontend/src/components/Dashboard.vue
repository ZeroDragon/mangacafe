<template lang="pug">
.dashboard
  h1 Dashboard
  p.placeholder Próximamente: resumen de actualizaciones y pendientes.
  router-link.cta(:to="{ path: '/series' }") Ir a mis series
</template>

<script>
export default {
  name: 'Dashboard'
}
</script>

<style lang="stylus" scoped>
.dashboard
  margin-top 24px
  h1
    font-weight 300
  .placeholder
    opacity 0.7
  .cta
    display inline-block
    margin-top 16px
    background var(--primary)
    color #fff
    padding 10px 16px
    border-radius 6px
    font-size 14px
    &:hover
      opacity 0.9
</style>
