<template lang="pug">
.dashboard
  header.bar
    .title
      h1 Dashboard
      .summary(v-if="!loading && !error")
        span {{ summary.totalPending }} chapter(s) pending
        span.dot ·
        span {{ summary.withUpdates }} series with updates
    .controls
      .search
        span.material-symbols-outlined search
        input(
          v-model="search"
          type="search"
          placeholder="Search by name…"
          aria-label="Search series by name")
      button.refresh(@click="refreshAll" :disabled="refreshing")
        span.material-symbols-outlined {{ refreshing ? 'progress_activity' : 'sync' }}
        span.label {{ refreshing ? 'Refreshing…' : 'Refresh' }}

  .filters(v-if="!loading && items.length")
    button(
      v-for="f in FILTERS"
      :key="f.key"
      :class="{ active: filter === f.key }"
      @click="filter = f.key")
      | {{ f.label }}

  p.error(v-if="error") {{ error }}

  Loader(v-if="loading" skeleton)
  .empty(v-else-if="!items.length")
    span.material-symbols-outlined library_books
    p You don't have any series yet, add one.
    router-link.cta(:to="{ path: '/series/new' }") Create series
  .empty(v-else-if="!summary.totalPending && filter === 'all' && !search")
    span.material-symbols-outlined check_circle
    p You're all caught up! No pending chapters.
    router-link.cta(:to="{ path: '/series' }") View my series
  .empty.filtered(v-else-if="!filtered.length")
    span.material-symbols-outlined search_off
    p No series match the filter.
    button.reset(@click="resetFilters") Clear filters
  .grid(v-else)
    article.card(
      v-for="s in filtered"
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
          span.badge.error(v-else-if="s.last_error" title="Feed error")
            span.material-symbols-outlined error
        h3.name
          router-link(:to="{ path: `/series/${s.id}` }") {{ s.name }}
        .chapter(v-if="s.pending > 0") Latest: {{ s.last_item_title || '—' }}
        .chapter(v-else) Current ch.: {{ s.current_chapter }}
        .error-msg(v-if="s.last_error" :title="s.last_error") Feed: {{ s.last_error }}
        .actions
          router-link.btn.icon-only(:to="{ path: `/series/${s.id}` }" title="Open")
            span.material-symbols-outlined open_in_new
          button.btn.icon-only(@click="markSeen(s)" :disabled="s.pending === 0" title="Mark all as seen")
            span.material-symbols-outlined done_all
</template>

<script>
import api from '../api.js'
import Loader from './Loader.vue'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'manga', label: 'Manga' },
  { key: 'anime', label: 'Anime' },
  { key: 'pending', label: 'With pending' },
  { key: 'error', label: 'With errors' }
]

export default {
  name: 'Dashboard',
  components: { Loader },
  data () {
    return {
      items: [],
      summary: { totalPending: 0, withUpdates: 0, total: 0 },
      loading: false,
      refreshing: false,
      error: '',
      search: '',
      filter: 'all',
      FILTERS
    }
  },
  computed: {
    filtered () {
      const q = this.search.trim().toLowerCase()
      return this.items.filter(s => {
        if (q && !s.name.toLowerCase().includes(q)) return false
        if (this.filter === 'manga' && s.type !== 'manga') return false
        if (this.filter === 'anime' && s.type !== 'anime') return false
        if (this.filter === 'pending' && s.pending === 0) return false
        if (this.filter === 'error' && !s.last_error) return false
        return true
      })
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
        this.error = 'Could not load the dashboard'
      } finally {
        this.loading = false
      }
    },
    async refreshAll () {
      this.refreshing = true
      try {
        await api.post('/api/refresh')
        await this.fetch()
        this.$toast.success('Feeds refreshed')
      } catch (e) {
        this.$toast.error('Could not refresh')
      } finally {
        this.refreshing = false
      }
    },
    async markSeen (s) {
      try {
        const res = await api.post(`/api/series/${s.id}/seen-all`)
        await this.fetch()
        const n = res.data.updated || 0
        if (n > 0) this.$toast.success(`${n} chapter(s) marked as seen in "${s.name}"`)
      } catch (e) {
        this.$toast.error('Could not mark')
      }
    },
    resetFilters () {
      this.search = ''
      this.filter = 'all'
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
  align-items flex-start
  justify-content space-between
  gap 12px
  margin-bottom 12px
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
.controls
  display flex
  gap 8px
  align-items center
  flex-wrap wrap
.search
  display flex
  align-items center
  gap 4px
  background rgba(0,0,0,0.25)
  border 1px solid rgba(255,255,255,0.1)
  border-radius 6px
  padding 0 8px
  .material-symbols-outlined
    font-size 18px
    opacity 0.5
  input
    background transparent
    border none
    color var(--foreground)
    padding 8px 4px
    font-size 14px
    width 200px
    &:focus
      outline none
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
.filters
  display flex
  gap 6px
  margin-bottom 12px
  flex-wrap wrap
  button
    background rgba(255,255,255,0.04)
    border 1px solid rgba(255,255,255,0.08)
    color var(--foreground)
    padding 5px 12px
    border-radius 999px
    cursor pointer
    font-size 13px
    &:hover
      background rgba(255,255,255,0.08)
    &.active
      background var(--primary)
      border-color var(--primary)
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
  &.filtered .material-symbols-outlined
    font-size 40px
  .reset
    background rgba(255,255,255,0.08)
    border 1px solid rgba(255,255,255,0.12)
    color var(--foreground)
    padding 6px 12px
    border-radius 6px
    cursor pointer
    font-size 13px
.error
  color var(--danger)
  text-align center
@media (max-width 560px)
  .search input
    width 140px
</style>
