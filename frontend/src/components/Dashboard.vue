<template lang="pug">
.dashboard
  header.bar
    .title
      h1 Dashboard
      .summary(v-if="!loading && !error")
        span {{ summary.totalPending }} capítulo(s) pendiente(s)
        span.dot ·
        span {{ summary.withUpdates }} serie(s) con novedades
    button.refresh(@click="refreshAll" :disabled="refreshing")
      span.material-symbols-outlined {{ refreshing ? 'progress_activity' : 'sync' }}
      span {{ refreshing ? 'Refrescando…' : 'Refrescar ahora' }}

  p.error(v-if="error") {{ error }}

  .loading(v-if="loading") Cargando…
  .empty(v-else-if="!items.length")
    span.material-symbols-outlined library_books
    p Aún no tenés series, agregá una.
    router-link.cta(:to="{ path: '/series/new' }") Crear serie
  .empty(v-else-if="!summary.totalPending")
    span.material-symbols-outlined check_circle
    p ¡Estás al día! No tenés capítulos pendientes.
    router-link.cta(:to="{ path: '/series' }") Ver mis series
  .grid(v-else)
    article.card(
      v-for="s in items"
      :key="s.id"
      :class="{ error: s.last_error }")
      .cover
        img(
          v-if="s.cover_url"
          :src="s.cover_url"
          :alt="s.name"
          referrerpolicy="no-referrer"
          @error="onCoverError")
        .cover-placeholder(v-else)
          span.material-symbols-outlined photo
      .body
        .top
          span.type-badge(:class="s.type") {{ s.type === 'anime' ? 'Anime' : 'Manga' }}
          span.badge.pending(v-if="s.pending > 0") {{ s.pending }}
          span.badge.error(v-else-if="s.last_error" title="Error de feed")
            span.material-symbols-outlined error
        h3.name
          router-link(:to="{ path: `/series/${s.id}` }") {{ s.name }}
        .chapter(v-if="s.pending > 0") Último: {{ s.last_item_title || '—' }}
        .chapter(v-else) Cap. actual: {{ s.current_chapter }}
        .error-msg(v-if="s.last_error" :title="s.last_error") Feed: {{ s.last_error }}
        .actions
          router-link.btn.icon-only(:to="{ path: `/series/${s.id}` }" title="Abrir")
            span.material-symbols-outlined open_in_new
          button.btn.icon-only(@click="markSeen(s)" :disabled="s.pending === 0" title="Marcar todo visto")
            span.material-symbols-outlined done_all
</template>

<script>
import api from '../api.js'

export default {
  name: 'Dashboard',
  data () {
    return {
      items: [],
      summary: { totalPending: 0, withUpdates: 0, total: 0 },
      loading: false,
      refreshing: false,
      error: ''
    }
  },
  mounted () {
    this.fetch()
  },
  methods: {
    async fetch () {
      this.loading = true
      this.error = ''
      try {
        const res = await api.get('/api/dashboard')
        this.items = res.data.data || []
        this.summary = res.data.summary || this.summary
      } catch (e) {
        this.error = 'No se pudo cargar el dashboard'
      } finally {
        this.loading = false
      }
    },
    async refreshAll () {
      this.refreshing = true
      try {
        await api.post('/api/refresh')
        await this.fetch()
      } catch (e) {
        this.error = 'No se pudo refrescar'
      } finally {
        this.refreshing = false
      }
    },
    async markSeen (s) {
      try {
        await api.post(`/api/series/${s.id}/seen-all`)
        await this.fetch()
      } catch (e) {
        this.error = (e.response && e.response.data && e.response.data.error) || 'No se pudo marcar'
      }
    },
    onCoverError (e) {
      e.target.style.display = 'none'
    }
  }
}
</script>

<style lang="stylus" scoped>
.dashboard
  margin-top 16px
.bar
  display flex
  align-items center
  justify-content space-between
  gap 12px
  margin-bottom 16px
  flex-wrap wrap
.title
  h1
    font-weight 300
    margin 0 0 4px
  .summary
    font-size 13px
    opacity 0.75
    .dot
      margin 0 6px
.refresh
  display inline-flex
  align-items center
  gap 6px
  background rgba(255,255,255,0.06)
  border 1px solid rgba(255,255,255,0.12)
  color var(--foreground)
  padding 8px 12px
  border-radius 6px
  cursor pointer
  font-size 14px
  &:hover:not(:disabled)
    background rgba(255,255,255,0.1)
  &:disabled
    opacity 0.6
    cursor not-allowed
  .material-symbols-outlined
    font-size 18px
.grid
  display grid
  grid-template-columns repeat(auto-fill, minmax(320px, 1fr))
  gap 12px
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
  align-items center
  gap 6px
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
  margin-left auto
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
    &:hover
      text-decoration underline
.chapter, .error-msg
  font-size 13px
  opacity 0.75
.error-msg
  color var(--danger)
  opacity 0.9
  overflow hidden
  text-overflow ellipsis
  white-space nowrap
.actions
  margin-top auto
  display flex
  gap 6px
.btn
  background transparent
  border 1px solid rgba(255,255,255,0.12)
  color var(--foreground)
  padding 6px
  border-radius 6px
  cursor pointer
  display inline-flex
  &:hover:not(:disabled)
    background rgba(255,255,255,0.08)
  &:disabled
    opacity 0.4
    cursor not-allowed
.icon-only .material-symbols-outlined
  font-size 18px
.loading, .empty
  text-align center
  opacity 0.7
  padding 40px 0
.empty
  display flex
  flex-direction column
  align-items center
  gap 12px
  .material-symbols-outlined
    font-size 48px
    opacity 0.4
  p
    margin 0
  .cta
    background var(--primary)
    color #fff
    padding 10px 16px
    border-radius 6px
    font-size 14px
.error
  color var(--danger)
  text-align center
</style>
