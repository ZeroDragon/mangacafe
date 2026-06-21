<template lang="pug">
.series-card
  .cover
    img(
      v-if="series.cover_url"
      :src="series.cover_url"
      :alt="series.name"
      referrerpolicy="no-referrer"
      @error="onCoverError")
    .cover-placeholder(v-else)
      span.material-symbols-outlined photo
  .body
    .top
      span.type-badge(:class="series.type") {{ series.type === 'anime' ? 'Anime' : 'Manga' }}
      span.pending(v-if="series.pending > 0") {{ series.pending }} pending
    h3.name {{ series.name }}
    .chapter Current ch.: {{ series.current_chapter }}
    .actions
      button.btn.icon-only(@click="$emit('edit', series)" title="Edit")
        span.material-symbols-outlined edit
      button.btn.icon-only.danger(@click="$emit('delete', series)" title="Delete")
        span.material-symbols-outlined delete
</template>

<script>
export default {
  name: 'SeriesCard',
  props: {
    series: { type: Object, required: true }
  },
  emits: ['edit', 'delete'],
  methods: {
    onCoverError (e) {
      // Oculta el img roto y deja el placeholder (no console spam)
      e.target.style.display = 'none'
    }
  }
}
</script>

<style lang="stylus" scoped>
.series-card
  display flex
  gap 12px
  background rgba(255,255,255,0.04)
  border 1px solid rgba(255,255,255,0.08)
  border-radius 10px
  padding 12px
  min-height 140px
.cover
  width 80px
  height 116px
  flex-shrink 0
  border-radius 6px
  overflow hidden
  background rgba(0,0,0,0.3)
  display flex
  align-items center
  justify-content center
  img
    width 100%
    height 100%
    object-fit cover
.cover-placeholder
  opacity 0.3
  .material-symbols-outlined
    font-size 32px
.body
  flex 1
  display flex
  flex-direction column
  gap 4px
  min-width 0
.top
  display flex
  justify-content space-between
  align-items center
  gap 8px
.type-badge
  font-size 11px
  text-transform uppercase
  letter-spacing 0.5px
  padding 2px 8px
  border-radius 999px
  background rgba(255,255,255,0.08)
  &.anime
    color #ff9
    background rgba(255,255,136,0.1)
  &.manga
    color #9cf
    background rgba(153,204,255,0.1)
.pending
  font-size 12px
  background var(--danger)
  color #fff
  padding 2px 8px
  border-radius 999px
  font-weight 500
.name
  margin 4px 0 0
  font-size 16px
  font-weight 500
  overflow hidden
  text-overflow ellipsis
.chapter
  font-size 13px
  opacity 0.75
.actions
  margin-top auto
  display flex
  gap 6px
  justify-content flex-end
.btn
  background transparent
  border 1px solid rgba(255,255,255,0.12)
  color var(--foreground)
  padding 6px
  border-radius 6px
  cursor pointer
  display inline-flex
  &:hover
    background rgba(255,255,255,0.08)
  &.danger:hover
    background rgba(255,99,71,0.15)
    border-color var(--danger)
.icon-only .material-symbols-outlined
  font-size 18px
</style>
