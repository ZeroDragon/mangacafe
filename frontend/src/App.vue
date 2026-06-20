<template lang="pug">
.app
  AppHeader(v-if="showHeader")
  main
    router-view
  Toasts
</template>

<script>
import AppHeader from './components/AppHeader.vue'
import Toasts from './components/Toasts.vue'

export default {
  name: 'App',
  components: { AppHeader, Toasts },
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
