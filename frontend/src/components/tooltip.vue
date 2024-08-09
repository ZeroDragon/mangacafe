<template lang="pug">
  .tooltip
    slot
    .toolTipText(:class="position") {{ text }}
</template>
<style lang="stylus" scoped>
.tooltip
  position relative
  .toolTipText
    visibility hidden
    opacity 0
    position absolute
    background-color var(--primary)
    color var(--foreground)
    padding: 5px
    border-radius: 5px
    z-index 1
    transition opacity 0.5s
    &.up
      bottom 20px
    &.down
      top 20px
  &:hover .toolTipText
    visibility visible
    opacity 1
</style>
<script>
export default {
  name: 'Tooltip',
  props: {
    text: String,
    position: String
  }
}
</script>
