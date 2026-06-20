<template lang="pug">
.series-detail(v-if="loaded")
  .back
    router-link(:to="{ path: '/series' }") ‹ Volver a series
  header.head(v-if="series")
    .cover
      img(
        v-if="series.cover_url"
        :src="series.cover_url"
        :alt="series.name"
        referrerpolicy="no-referrer"
        @error="onCoverError")
      .cover-placeholder(v-else)
        span.material-symbols-outlined photo
    .info
      .top
        span.type-badge(:class="series.type") {{ series.type === 'anime' ? 'Anime' : 'Manga' }}
        span.badge.pending(v-if="pendingItems.length") {{ pendingItems.length }} pendiente(s)
      h1.name {{ series.name }}
      .chapter Capítulo actual: {{ series.current_chapter }}
      .meta(v-if="series.url")
        a.outside(:href="series.url" target="_blank" rel="noopener")
          span.material-symbols-outlined open_in_new
          span Abrir donde lo leo/veo
      .rss-status(v-if="series.rss_url")
        span.material-symbols-outlined rss_feed
        span(v-if="series.last_error" class="rss-error" :title="series.last_error") Error de feed: {{ series.last_error }}
        span(v-else-if="series.last_checked_at") Último refresco: {{ formatDate(series.last_checked_at) }}
        span(v-else) Sin refrescar aún
      .rss-status.empty(v-else)
        span.material-symbols-outlined info
        span Sin feed RSS — agregá uno en editar para seguimiento automático
      .actions
        button.btn(@click="refresh" :disabled="refreshing")
          span.material-symbols-outlined {{ refreshing ? 'progress_activity' : 'sync' }}
          span {{ refreshing ? 'Refrescando…' : 'Refrescar RSS' }}
        button.btn.all(@click="seenAll" :disabled="!pendingItems.length")
          span.material-symbols-outlined done_all
          span Marcar todo visto
        router-link.btn.edit(:to="{ path: `/series/${series.id}/edit` }")
          span.material-symbols-outlined edit
          span Editar
        button.btn.danger(@click="remove")
          span.material-symbols-outlined delete
          span Eliminar
  p.error(v-if="error") {{ error }}
  section.feed
    h2(v-if="items.length") Capítulos / episodios
    .empty(v-if="!items.length")
      span.material-symbols-outlined inbox
      p No hay items del feed todavía. {{ series.rss_url ? 'Probá refrescar.' : 'Agregá un feed RSS para seguimiento automático.' }}
    ul.items(v-else)
      li.item(
        v-for="it in items"
        :key="it.id"
        :class="{ seen: it.seen }")
        .item-main
          a.title(:href="itemLink(it)" target="_blank" rel="noopener") {{ it.title || '(sin título)' }}
          .date {{ formatDate(it.pub_date) }}
        .item-actions
          a.icon-link(v-if="itemLink(it)" :href="itemLink(it)" target="_blank" rel="noopener" title="Abrir")
            span.material-symbols-outlined open_in_new
          button.icon-btn(
            v-if="!it.seen"
            @click="markItem(it)"
            title="Marcar visto")
            span.material-symbols-outlined check
          span.done(v-else title="Visto")
            span.material-symbols-outlined check_circle
</template>

<script>
import api from '../api.js'

export default {
  name: 'SeriesDetail',
  data () {
    return {
      series: null,
      items: [],
      loaded: false,
      refreshing: false,
      error: ''
    }
  },
  computed: {
    pendingItems () {
      return this.items.filter(i => !i.seen)
    }
  },
  async mounted () {
    await Promise.all([this.loadSeries(), this.loadFeed()])
    this.loaded = true
  },
  methods: {
    async loadSeries () {
      try {
        const res = await api.get(`/api/series/${this.$route.params.id}`)
        this.series = res.data.data
      } catch (e) {
        if (e.response && e.response.status === 404) {
          this.$router.push('/series')
        } else {
          this.error = 'No se pudo cargar la serie'
        }
      }
    },
    async loadFeed () {
      try {
        const res = await api.get(`/api/series/${this.$route.params.id}/feed`)
        this.items = res.data.data || []
      } catch (e) {
        this.error = 'No se pudo cargar el feed'
      }
    },
    itemLink (it) {
      return it.link || (this.series && this.series.url) || ''
    },
    async markItem (it) {
      try {
        await api.post(`/api/series/${this.$route.params.id}/items/${it.id}/seen`)
        it.seen = 1
      } catch (e) {
        this.error = 'No se pudo marcar el item'
      }
    },
    async seenAll () {
      try {
        await api.post(`/api/series/${this.$route.params.id}/seen-all`)
        await this.loadFeed()
      } catch (e) {
        this.error = 'No se pudo marcar todo'
      }
    },
    async refresh () {
      this.refreshing = true
      try {
        await api.post(`/api/series/${this.$route.params.id}/refresh`)
        await Promise.all([this.loadSeries(), this.loadFeed()])
      } catch (e) {
        this.error = 'No se pudo refrescar'
      } finally {
        this.refreshing = false
      }
    },
    async remove () {
      if (!confirm(`¿Eliminar "${this.series.name}"? Se borrarán también sus items.`)) return
      try {
        await api.delete(`/api/series/${this.series.id}`)
        this.$router.push('/series')
      } catch (e) {
        this.error = 'No se pudo eliminar'
      }
    },
    formatDate (epoch) {
      if (!epoch) return ''
      return new Date(epoch * 1000).toLocaleDateString()
    },
    onCoverError (e) {
      e.target.style.display = 'none'
    }
  }
}
</script>

<style lang="stylus" scoped>
.series-detail
  margin-top 12px
.back
  font-size 13px
  opacity 0.7
  margin-bottom 8px
  a:hover
    opacity 1
.head
  display flex
  gap 16px
  background rgba(255,255,255,0.04)
  border 1px solid rgba(255,255,255,0.08)
  border-radius 10px
  padding 16px
  margin-bottom 20px
.cover
  width 100px
  height 145px
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
    font-size 36px
.info
  flex 1
  display flex
  flex-direction column
  gap 6px
  min-width 0
.top
  display flex
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
  &.pending
    background var(--danger)
    color #fff
.name
  margin 0
  font-size 22px
  font-weight 500
.chapter
  font-size 14px
  opacity 0.75
.meta, .rss-status
  font-size 13px
  display flex
  align-items center
  gap 6px
  .material-symbols-outlined
    font-size 18px
  &.empty
    opacity 0.6
  .rss-error
    color var(--danger)
.outside
  display inline-flex
  align-items center
  gap 4px
  color var(--primary)
  text-decoration none
  &:hover
    text-decoration underline
.actions
  display flex
  gap 8px
  margin-top 8px
  flex-wrap wrap
.btn
  display inline-flex
  align-items center
  gap 4px
  background rgba(255,255,255,0.06)
  border 1px solid rgba(255,255,255,0.12)
  color var(--foreground)
  padding 6px 10px
  border-radius 6px
  cursor pointer
  font-size 13px
  text-decoration none
  &:hover:not(:disabled)
    background rgba(255,255,255,0.1)
  &:disabled
    opacity 0.4
    cursor not-allowed
  &.danger
    &:hover
      background rgba(255,99,71,0.15)
      border-color var(--danger)
  .material-symbols-outlined
    font-size 18px
.feed
  h2
    font-weight 400
    margin 0 0 12px
.empty
  text-align center
  padding 30px 0
  opacity 0.7
  display flex
  flex-direction column
  align-items center
  gap 8px
  .material-symbols-outlined
    font-size 40px
    opacity 0.4
.items
  list-style none
  padding 0
  margin 0
.item
  display flex
  align-items center
  gap 12px
  padding 10px 4px
  border-bottom 1px solid rgba(255,255,255,0.06)
  &.seen .title
    text-decoration line-through
    opacity 0.5
.item-main
  flex 1
  min-width 0
.title
  display block
  font-size 14px
  color inherit
  text-decoration none
  overflow hidden
  text-overflow ellipsis
  white-space nowrap
  &:hover
    text-decoration underline
.date
  font-size 12px
  opacity 0.6
.item-actions
  display flex
  align-items center
  gap 6px
.icon-link, .icon-btn
  display inline-flex
  color inherit
  background transparent
  border none
  cursor pointer
  padding 4px
  border-radius 4px
  &:hover
    background rgba(255,255,255,0.08)
.icon-btn:hover
  color var(--primary)
.done
  color var(--primary)
  opacity 0.6
  .material-symbols-outlined
    font-size 20px
.error
  color var(--danger)
  text-align center
</style>
