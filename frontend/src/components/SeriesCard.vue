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
      span.material-symbols-outlined {{ placeholderIcon }}
  .body
    .top
      span.type-badge(:class="series.type") {{ badgeLabel }}
      span.badge.pending(v-if="series.pending > 0") {{ series.pending }}
      span.badge.error(v-else-if="series.last_error" title="Feed error")
        span.material-symbols-outlined error
    h3.name
      router-link(:to="cardTo") {{ series.name }}
    .line.latest(v-if="series.pending > 0") Latest: {{ series.last_item_title || '—' }}
    .line.last-read(v-if="showLastRead") Last read: {{ series.last_read || 'No data' }}
    .error-msg(v-if="series.last_error" :title="series.last_error") Feed: {{ series.last_error }}
</template>

<script>
export default {
  name: 'SeriesCard',
  props: {
    series: { type: Object, required: true },
    // Override del router-link del nombre. Default: /series/:id.
    // Permite reusar el card para secciones no-series (e.g. Reels → /reels).
    to: { type: [String, Object], default: '' }
  },
  computed: {
    cardTo () {
      // `to` tiene prioridad; si no, default al detalle de la serie.
      return this.to || { path: `/series/${this.series.id}` }
    },
    badgeLabel () {
      if (this.series.type === 'anime') return 'Show'
      if (this.series.type === 'manga') return 'Graphic novel'
      if (this.series.type === 'reel') return 'Bookmarks'
      return this.series.type
    },
    placeholderIcon () {
      return this.series.type === 'reel' ? 'bookmark' : 'photo'
    },
    // Para reels no aplica el indicador de "Last read" (no hay progreso).
    showLastRead () {
      return this.series.type !== 'reel'
    }
  },
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
  &.reel
    color #fc9
    background rgba(255,204,153,0.12)
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
</style>
