<template lang="pug">
.toast-container
  transition-group(name="toast")
    .toast(
      v-for="t in state.items"
      :key="t.id"
      :class="t.type"
      @click="dismiss(t.id)")
      span.material-symbols-outlined.icon {{ icon(t.type) }}
      span.msg {{ t.message }}
</template>

<script>
import { manager } from '../toast.js'

export default {
  name: 'Toasts',
  data () {
    return { state: manager.state }
  },
  methods: {
    icon (type) {
      if (type === 'success') return 'check_circle'
      if (type === 'error') return 'error'
      return 'info'
    },
    dismiss (id) {
      manager.dismiss(id)
    }
  }
}
</script>

<style lang="stylus" scoped>
// Nota: quitamos `scoped` para que las clases animadas funcionen mejor en transition-group;
// aislamos igual vía .toast-container.
.toast-container
  position fixed
  bottom 20px
  right 20px
  z-index 1000
  display flex
  flex-direction column
  gap 8px
.toast
  display flex
  align-items center
  gap 8px
  background rgba(30,38,50,0.95)
  color var(--foreground)
  border 1px solid rgba(255,255,255,0.12)
  border-left 3px solid var(--primary)
  padding 10px 14px
  border-radius 6px
  min-width 240px
  max-width 360px
  font-size 14px
  cursor pointer
  box-shadow 0 6px 20px rgba(0,0,0,0.4)
  &.success
    border-left-color #4caf50
  &.error
    border-left-color var(--danger)
  .icon
    font-size 20px
  &.success .icon
    color #4caf50
  &.error .icon
    color var(--danger)
.toast-enter-active, .toast-leave-active
  transition all 0.25s ease
.toast-enter-from, .toast-leave-to
  opacity 0
  transform translateX(20px)
</style>
