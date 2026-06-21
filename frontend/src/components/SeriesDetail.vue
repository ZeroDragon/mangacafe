<template lang="pug">
Loader(v-if="!loaded" text="Loading series…")
.series-detail(v-else)
  .back
    router-link(:to="{ path: '/series' }") ‹ Back to series
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
        span.badge.pending(v-if="pendingItems.length") {{ pendingItems.length }} pending
      h1.name {{ series.name }}
      .chapter Current chapter: {{ series.current_chapter }}
      .meta(v-if="series.url")
        a.outside(:href="series.url" target="_blank" rel="noopener")
          span.material-symbols-outlined open_in_new
          span Open where I read/watch it
      .imdb-status(v-if="series.imdb_url")
        span.material-symbols-outlined movie
        span(v-if="series.last_error" class="imdb-error" :title="series.last_error") IMDB error: {{ series.last_error }}
        span(v-else-if="series.last_checked_at") Last refresh: {{ formatDate(series.last_checked_at) }}
        span(v-else) Not refreshed yet
      .imdb-status.empty(v-else)
        span.material-symbols-outlined info
        span No IMDB URL — add one in edit for automatic tracking
      .actions
        button.btn(@click="refresh" :disabled="refreshing")
          span.material-symbols-outlined {{ refreshing ? 'progress_activity' : 'sync' }}
          span {{ refreshing ? 'Refreshing…' : 'Refresh IMDB' }}
        button.btn.all(@click="seenAll" :disabled="!pendingItems.length")
          span.material-symbols-outlined done_all
          span Mark all as seen
        router-link.btn.edit(:to="{ path: `/series/${series.id}/edit` }")
          span.material-symbols-outlined edit
          span Edit
        button.btn.danger(@click="remove")
          span.material-symbols-outlined delete
          span Delete
  p.error(v-if="error") {{ error }}
  section.feed
    h2(v-if="items.length") Chapters / episodes
    .empty(v-if="!items.length")
      span.material-symbols-outlined inbox
      p No feed items yet. {{ series.imdb_url ? 'Try refreshing.' : 'Add an IMDB episodes URL for automatic tracking.' }}
    ul.items(v-else)
      li.item(
        v-for="it in items"
        :key="it.id"
        :class="{ seen: it.seen }")
        .item-main
          a.title(:href="itemLink(it)" target="_blank" rel="noopener") {{ it.title || '(untitled)' }}
          .date {{ formatDate(it.pub_date, true) }}
        .item-actions
          a.icon-link(v-if="itemLink(it)" :href="itemLink(it)" target="_blank" rel="noopener" title="Open")
            span.material-symbols-outlined open_in_new
          button.icon-btn(
            v-if="!it.seen"
            @click="toggleItem(it)"
            title="Mark as seen")
            span.material-symbols-outlined check
          button.icon-btn.done(
            v-else
            @click="toggleItem(it)"
            title="Mark as pending")
            span.material-symbols-outlined check_circle
</template>

<script>
import api from '../api.js'
import Loader from './Loader.vue'

export default {
  name: 'SeriesDetail',
  components: { Loader },
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
          this.error = 'Could not load the series'
        }
      }
    },
    async loadFeed () {
      try {
        const res = await api.get(`/api/series/${this.$route.params.id}/feed`)
        this.items = res.data.data || []
      } catch (e) {
        this.error = 'Could not load the feed'
      }
    },
    itemLink (it) {
      return it.link || (this.series && this.series.url) || ''
    },
    async toggleItem (it) {
      const id = this.$route.params.id
      try {
        if (it.seen) {
          await api.delete(`/api/series/${id}/items/${it.id}/seen`)
          it.seen = 0
          this.$toast.success('Marked as pending')
        } else {
          await api.post(`/api/series/${id}/items/${it.id}/seen`)
          it.seen = 1
          this.$toast.success('Marked as seen')
        }
      } catch (e) {
        this.$toast.error('Could not update the item')
      }
    },
    async seenAll () {
      try {
        const res = await api.post(`/api/series/${this.$route.params.id}/seen-all`)
        await this.loadFeed()
        const n = res.data.updated || 0
        if (n > 0) this.$toast.success(`${n} chapter(s) marked as seen`)
        else this.$toast.info('No pending items')
      } catch (e) {
        this.$toast.error('Could not mark all')
      }
    },
    async refresh () {
      this.refreshing = true
      try {
        await api.post(`/api/series/${this.$route.params.id}/refresh`)
        await Promise.all([this.loadSeries(), this.loadFeed()])
        this.$toast.success('Feed refreshed')
      } catch (e) {
        this.$toast.error('Could not refresh')
      } finally {
        this.refreshing = false
      }
    },
    async remove () {
      if (!confirm(`Delete "${this.series.name}"? Its items will also be deleted.`)) return
      try {
        await api.delete(`/api/series/${this.series.id}`)
        this.$toast.success('Series deleted')
        this.$router.push('/series')
      } catch (e) {
        this.$toast.error('Could not delete')
      }
    },
    formatDate (epoch, calendar = false) {
      if (!epoch) return ''
      // calendar=true: la fecha viene como medianoche UTC de un día concreto
      // (fecha de emisión de IMDB); hay que mostrarla en UTC para que no se
      // desplace -1 día en zonas horarias negativas. calendar=false: instante
      // real (ej. last_checked_at), se muestra en TZ local del navegador.
      return new Date(epoch * 1000).toLocaleDateString(undefined, calendar ? { timeZone: 'UTC' } : undefined)
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
.meta, .imdb-status
  font-size 13px
  display flex
  align-items center
  gap 6px
  .material-symbols-outlined
    font-size 18px
  &.empty
    opacity 0.6
  .imdb-error
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
  &:hover
    opacity 1
  .material-symbols-outlined
    font-size 20px
.error
  color var(--danger)
  text-align center
</style>
