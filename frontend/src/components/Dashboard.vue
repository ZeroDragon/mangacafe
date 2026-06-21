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

  template(v-else)
    // Main grid: filterable view (Pending by default)
    .grid(v-if="filtered.length")
      DashCard(
        v-for="s in filtered"
        :key="s.id"
        :series="s"
        @mark-seen="markSeen")
    .empty.filtered(v-else-if="filter === 'pending' && !search")
      span.material-symbols-outlined check_circle
      p You're all caught up! No pending chapters.
      router-link.cta(:to="{ path: '/series' }") View my series
    .empty.filtered(v-else)
      span.material-symbols-outlined search_off
      p No series match the filter.
      button.reset(@click="resetFilters") Clear filters

    // All series: every item regardless of pending/type
    section.list-section(v-if="allItems.length")
      h2.section-title All series ({{ allItems.length }})
      .grid
        DashCard(
          v-for="s in allItems"
          :key="s.id"
          :series="s"
          @mark-seen="markSeen")

    // Errors: series with feed errors
    section.list-section(v-if="errorItems.length")
      h2.section-title.section-title-error Errors ({{ errorItems.length }})
      .grid
        DashCard(
          v-for="s in errorItems"
          :key="s.id"
          :series="s"
          @mark-seen="markSeen")
</template>

<script>
import api from '../api.js'
import Loader from './Loader.vue'
import DashCard from './DashCard.vue'

const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'manga', label: 'Manga' },
  { key: 'anime', label: 'Anime' }
]

export default {
  name: 'Dashboard',
  components: { Loader, DashCard },
  data () {
    return {
      items: [],
      summary: { totalPending: 0, withUpdates: 0, total: 0 },
      loading: false,
      refreshing: false,
      error: '',
      search: '',
      filter: 'pending',
      FILTERS
    }
  },
  computed: {
    matches () {
      const q = this.search.trim().toLowerCase()
      return (s) => !q || s.name.toLowerCase().includes(q)
    },
    filtered () {
      return this.items.filter(s => {
        if (!this.matches(s)) return false
        if (this.filter === 'manga' && s.type !== 'manga') return false
        if (this.filter === 'anime' && s.type !== 'anime') return false
        if (this.filter === 'pending' && s.pending === 0) return false
        return true
      })
    },
    allItems () {
      return this.items.filter(this.matches)
    },
    errorItems () {
      return this.items.filter(s => s.last_error && this.matches(s))
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
      this.filter = 'pending'
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
.list-section
  margin-top 32px
.section-title
  font-weight 400
  font-size 13px
  opacity 0.75
  margin 0 0 12px
  text-transform uppercase
  letter-spacing 0.5px
  &.section-title-error
    color var(--danger)
    opacity 0.9
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
