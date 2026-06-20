<template lang="pug">
.app
  AppHeader(v-if="showHeader")
  main
    router-view
</template>

<script>
import AppHeader from './components/AppHeader.vue'

export default {
  name: 'App',
  components: { AppHeader },
  computed: {
    showHeader () {
      return this.$route.path !== '/login'
    }
  }
}
</script>

<style lang="stylus" scoped>
.app
  min-height 100vh
main
  padding 0 10px
</style>
