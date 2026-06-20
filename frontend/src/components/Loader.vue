<template lang="pug">
.loader(v-if="!skeleton")
  span.material-symbols-outlined.spin progress_activity
  span(v-if="text") {{ text }}
.skeleton(v-else :class="{ grid: grid }")
  .sk-card(v-for="n in count" :key="n")
    .sk-line.w-cover
    .sk-col
      .sk-line.w-60
      .sk-line.w-40
      .sk-line.w-30
</template>

<script>
export default {
  name: 'Loader',
  props: {
    text: { type: String, default: '' },
    skeleton: { type: Boolean, default: false },
    count: { type: Number, default: 6 },
    grid: { type: Boolean, default: true }
  }
}
</script>

<style lang="stylus" scoped>
.loader
  display flex
  align-items center
  justify-content center
  gap 8px
  padding 40px 0
  opacity 0.7
  .spin
    animation spin 0.8s linear infinite
    font-size 22px
@keyframes spin
  to
    transform rotate(360deg)
.skeleton.grid
  display grid
  grid-template-columns repeat(auto-fill, minmax(320px, 1fr))
  gap 12px
.sk-card
  display flex
  gap 12px
  background rgba(255,255,255,0.03)
  border 1px solid rgba(255,255,255,0.06)
  border-radius 10px
  padding 12px
  min-height 140px
.sk-line
  height 12px
  border-radius 4px
  background linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.05) 100%)
  background-size 200% 100%
  animation shimmer 1.4s infinite
  margin-bottom 8px
  &:last-child
    margin-bottom 0
.sk-col
  flex 1
  display flex
  flex-direction column
  justify-content center
.w-cover
  width 80px
  height 116px
  flex-shrink 0
.w-60
  width 60%
.w-40
  width 40%
.w-30
  width 30%
@keyframes shimmer
  to
    background-position -200% 0
</style>
