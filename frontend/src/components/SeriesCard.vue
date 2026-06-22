<template lang="pug">
article.card(:class="{ error: series.last_error }")
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
      span.badge.pending(v-if="series.pending > 0") {{ series.pending }}
      span.badge.error(v-else-if="series.last_error" title="Feed error")
        span.material-symbols-outlined error
    h3.name
      router-link(:to="{ path: `/series/${series.id}` }") {{ series.name }}
    .line.latest(v-if="series.pending > 0") Latest: {{ series.last_item_title || '—' }}
    .line.last-read Last read: {{ series.last_read || 'No data' }}
    .error-msg(v-if="series.last_error" :title="series.last_error") Feed: {{ series.last_error }}
    .actions
      router-link.btn.icon-only(:to="{ path: `/series/${series.id}` }" title="Open")
        span.material-symbols-outlined open_in_new
      button.btn.icon-only(
        v-if="showMarkSeen"
        @click="$emit('mark-seen', series)"
        :disabled="series.pending === 0"
        title="Mark all as seen")
        span.material-symbols-outlined done_all
      button.btn.icon-only(
        v-if="showEdit"
        @click="$emit('edit', series)"
        title="Edit")
        span.material-symbols-outlined edit
      button.btn.icon-only.danger(
        v-if="showEdit"
        @click="$emit('delete', series)"
        title="Delete")
        span.material-symbols-outlined delete
</template>

<script>
export default {
  name: 'SeriesCard',
  props: {
    series: { type: Object, required: true },
    showEdit: { type: Boolean, default: false },
    showMarkSeen: { type: Boolean, default: false }
  },
  emits: ['edit', 'delete', 'mark-seen'],
  methods: {
    onCoverError (e) {
      // Oculta el img roto y deja el placeholder (no console spam)
      e.target.style.display = 'none'
    }
  }
}
</script>

<style lang="stylus" scoped>
.card
  display flex
  gap 12px
  background rgba(255,255,255,0.04)
  border 1px solid rgba(255,255,255,0.08)
  border-radius 10px
  padding 12px
  min-height 140px
  &.error
    border-color rgba(255,99,71,0.4)
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
.badge
  font-size 12px
  padding 2px 8px
  border-radius 999px
  display inline-flex
  align-items center
  &.pending
    background var(--danger)
    color #fff
    font-weight 500
  &.error
    background rgba(255,99,71,0.15)
    color var(--danger)
    .material-symbols-outlined
      font-size 16px
.name
  margin 4px 0 0
  font-size 16px
  font-weight 500
  overflow hidden
  text-overflow ellipsis
  a
    color inherit
    text-decoration none
    &:hover
      text-decoration underline
.line
  font-size 13px
  opacity 0.75
  overflow hidden
  text-overflow ellipsis
  white-space nowrap
.latest
  color var(--primary)
  opacity 0.9
.error-msg
  font-size 13px
  color var(--danger)
  opacity 0.9
  overflow hidden
  text-overflow ellipsis
  white-space nowrap
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
  text-decoration none
  &:hover:not(:disabled)
    background rgba(255,255,255,0.08)
  &:disabled
    opacity 0.4
    cursor not-allowed
  &.danger:hover
    background rgba(255,99,71,0.15)
    border-color var(--danger)
.icon-only .material-symbols-outlined
  font-size 18px
</style>
