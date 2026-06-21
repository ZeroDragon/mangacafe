<template lang="pug">
.crunchyroll
  header.bar
    .title
      h1 Crunchyroll
      .summary(v-if="items.length")
        span {{ items.length }} series in your list
        span.dot ·
        span {{ counts.incomplete }} watching
        span.dot ·
        span {{ counts.pending }} pending
        span.dot ·
        span {{ counts.watched }} watched
        span.dot ·
        span {{ counts.unstarted }} unstarted
        span.dot(v-if="syncedAgo")
        span.cached(v-if="syncedAgo") updated {{ syncedAgo }}

  // Form de credenciales (no se persisten; el email se recuerda por comodidad)
  form.credentials(@submit.prevent="sync")
    .field
      label(for="cr-email") Email
      input#cr-email(
        v-model="email"
        type="email"
        placeholder="tu@email.com"
        autocomplete="username"
        required)
    .field
      label(for="cr-pass") Password
      input#cr-pass(
        v-model="password"
        type="password"
        placeholder="••••••••"
        autocomplete="current-password"
        required)
    button.sync(type="submit" :disabled="loading || !email || !password")
      span.material-symbols-outlined {{ loading ? 'progress_activity' : 'sync' }}
      span.label {{ loading ? 'Syncing…' : (synced ? 'Re-sync' : 'Sync my list') }}
    button.forget(
      v-if="synced"
      type="button"
      @click="forgetCache"
      title="Clear saved list")
      span.material-symbols-outlined delete
      span.label Clear

  p.error(v-if="error") {{ error }}

  Loader(v-if="loading" skeleton)

  .empty(v-else-if="synced && !items.length")
    span.material-symbols-outlined inbox
    p Your Crunchyroll watchlist is empty.

  // Filtros por estado
  .filters(v-if="items.length")
    button(
      v-for="f in FILTERS"
      :key="f.key"
      :class="{ active: filter === f.key }"
      @click="filter = f.key")
      | {{ f.label }}
      span.count(v-if="f.key !== 'all'") {{ counts[f.key] || 0 }}

  table.wl-table(v-if="filtered.length")
    thead
      tr
        th Series
        th Latest episode
        th Status
        th
    tbody
      tr(v-for="it in filtered" :key="it.name")
        td.name {{ it.name }}
        td.ep
          span.ep-label {{ it.label }}
          span.ep-title(v-if="it.title && it.status !== 'unstarted'")  · {{ it.title }}
        td.status
          span.badge(:class="it.status") {{ STATUS_TEXT[it.status] }}
        td.actions
          button.add-series(
            type="button"
            @click="addToSeries(it)"
            :disabled="resolving === it.name"
            title="Add to series")
            span.material-symbols-outlined {{ resolving === it.name ? 'progress_activity' : 'add_circle' }}
            span.label {{ resolving === it.name ? '…' : 'Add' }}

  .empty.filtered(v-else-if="items.length")
    span.material-symbols-outlined filter_alt_off
    p No series in this filter.
    button.reset(@click="filter = 'all'") See all
</template>

<script>
import api from '../api.js'
import Loader from './Loader.vue'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'incomplete', label: 'Watching' },
  { key: 'pending', label: 'Pending' },
  { key: 'watched', label: 'Watched' },
  { key: 'unstarted', label: 'Unstarted' }
]

const STATUS_TEXT = {
  incomplete: 'Incomplete',
  pending: 'Pending',
  watched: 'Watched',
  unstarted: 'Unstarted'
}

const CACHE_KEY = 'cr_cache'

// Lee el cache de watchlist de localStorage. Estructura:
//   { email, items, syncedAt }
// Devuelve null si no hay o está corrupto (no lanza).
const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (!c || !Array.isArray(c.items)) return null
    return c
  } catch {
    return null
  }
}

const writeCache = (cache) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage lleno o deshabilitado; el sync sigue funcionando en memoria.
  }
}

const clearCache = () => {
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}

// Formatea syncedAt (epoch ms) como "hace Xm/h/d" o fecha corta si es viejo.
const formatAgo = (ts) => {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

const cache = readCache()

export default {
  name: 'Crunchyroll',
  components: { Loader },
  data () {
    return {
      email: (cache && cache.email) || localStorage.getItem('cr_email') || '',
      password: '',
      items: (cache && cache.items) || [],
      loading: false,
      synced: !!cache,
      syncedAt: (cache && cache.syncedAt) || null,
      error: '',
      filter: 'all',
      resolving: null,
      FILTERS,
      STATUS_TEXT
    }
  },
  computed: {
    counts () {
      const c = { incomplete: 0, pending: 0, watched: 0, unstarted: 0 }
      for (const it of this.items) if (c[it.status] != null) c[it.status]++
      return c
    },
    filtered () {
      if (this.filter === 'all') return this.items
      return this.items.filter(it => it.status === this.filter)
    },
    syncedAgo () {
      return formatAgo(this.syncedAt)
    }
  },
  methods: {
    async sync () {
      this.loading = true
      this.error = ''
      try {
        const res = await api.post('/api/crunchyroll/sync', {
          email: this.email,
          password: this.password
        })
        this.items = res.data.data || []
        this.synced = true
        this.syncedAt = Date.now()
        // Persistimos para no volver a pegarle a Crunchyroll en cada visita.
        // La contraseña NUNCA se guarda: solo email + items + timestamp.
        writeCache({ email: this.email, items: this.items, syncedAt: this.syncedAt })
        localStorage.setItem('cr_email', this.email)
        this.$toast.success(`${this.items.length} series synced`)
      } catch (e) {
        const msg = e.response?.data?.error || 'Could not sync with Crunchyroll'
        this.error = msg
      } finally {
        this.loading = false
      }
    },
    // Descarta el cache y el listado en memoria. El email se conserva para
    // no tener que re-escribirlo en el próximo sync.
    forgetCache () {
      clearCache()
      this.items = []
      this.synced = false
      this.syncedAt = null
      this.filter = 'all'
      this.error = ''
    },
    // Pre-puebla el alta de series con los datos del item de Crunchyroll +
    // la resolución IMDB (ttId → imdb_url + poster). Si IMDB no resuelve,
    // seguimos igual pero sin cover/imdb_url.
    async addToSeries (it) {
      this.resolving = it.name
      let imdb = null
      try {
        const res = await api.get('/api/crunchyroll/resolve', {
          params: { name: it.name, season: it.season }
        })
        imdb = res.data.data
      } catch (e) {
        // IMDB puede no encontrar el título; no bloqueamos el alta.
      }
      const seasonSuffix = it.season != null ? ` S${it.season}` : ''
      const query = {
        type: 'anime',
        name: `${it.name}${seasonSuffix}`,
        current_chapter: it.episode != null ? it.episode : 0
      }
      if (imdb) {
        query.imdb_url = imdb.imdbUrl
        if (imdb.poster) query.cover_url = imdb.poster
      } else if (it.cr_poster) {
        query.cover_url = it.cr_poster
      }
      if (it.cr_url) query.url = it.cr_url
      this.resolving = null
      this.$router.push({ path: '/series/new', query })
    }
  }
}
</script>

<style lang="stylus" scoped>
.crunchyroll
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
.credentials
  display flex
  gap 10px
  align-items flex-end
  flex-wrap wrap
  background rgba(0,0,0,0.25)
  border 1px solid rgba(255,255,255,0.1)
  border-radius 8px
  padding 14px
  margin-bottom 16px
.field
  display flex
  flex-direction column
  gap 4px
  flex 1 1 200px
  label
    font-size 12px
    opacity 0.7
  input
    background rgba(0,0,0,0.3)
    border 1px solid rgba(255,255,255,0.12)
    border-radius 6px
    color var(--foreground)
    padding 8px 10px
    font-size 14px
    &:focus
      outline none
      border-color var(--primary)
.sync
  display inline-flex
  align-items center
  gap 6px
  background var(--primary)
  border 1px solid var(--primary)
  color #fff
  padding 9px 16px
  border-radius 6px
  cursor pointer
  font-size 14px
  &:hover:not(:disabled)
    filter brightness(1.1)
  &:disabled
    opacity 0.6
    cursor not-allowed
  .material-symbols-outlined
    font-size 18px
.cached
  opacity 0.6
  font-style italic
.forget
  display inline-flex
  align-items center
  gap 6px
  background transparent
  border 1px solid rgba(255,255,255,0.12)
  color var(--foreground)
  padding 9px 14px
  border-radius 6px
  cursor pointer
  font-size 14px
  &:hover
    background rgba(255,255,255,0.08)
    border-color var(--danger)
    color var(--danger)
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
    .count
      opacity 0.6
      margin-left 4px
.wl-table
  width 100%
  border-collapse collapse
  font-size 14px
  thead th
    text-align left
    font-weight 400
    font-size 12px
    text-transform uppercase
    letter-spacing 0.5px
    opacity 0.6
    padding 8px 10px
    border-bottom 1px solid rgba(255,255,255,0.1)
  tbody tr
    &:hover
      background rgba(255,255,255,0.03)
  td
    padding 10px
    border-bottom 1px solid rgba(255,255,255,0.05)
    vertical-align middle
  .name
    font-weight 400
  .ep
    .ep-label
      font-variant-numeric tabular-nums
    .ep-title
      opacity 0.55
      font-size 12px
  .badge
    display inline-block
    padding 3px 10px
    border-radius 999px
    font-size 12px
    border 1px solid transparent
    &.incomplete
      background rgba(255,193,7,0.12)
      color #ffcc66
      border-color rgba(255,193,7,0.3)
    &.pending
      background rgba(58,138,255,0.12)
      color #7eb0ff
      border-color rgba(58,138,255,0.3)
    &.watched
      background rgba(80,200,120,0.12)
      color #88dca0
      border-color rgba(80,200,120,0.3)
    &.unstarted
      background rgba(255,255,255,0.05)
      color rgba(255,255,255,0.5)
      border-color rgba(255,255,255,0.1)
  .actions
    text-align right
    .add-series
      display inline-flex
      align-items center
      gap 4px
      background transparent
      border 1px solid rgba(255,255,255,0.12)
      color var(--foreground)
      padding 5px 10px
      border-radius 6px
      cursor pointer
      font-size 12px
      .material-symbols-outlined
        font-size 16px
      &:hover:not(:disabled)
        background rgba(255,255,255,0.08)
        border-color var(--primary)
      &:disabled
        opacity 0.5
        cursor not-allowed
.empty
  text-align center
  opacity 0.7
  padding 40px 0
  display flex
  flex-direction column
  align-items center
  gap 12px
  .material-symbols-outlined
    font-size 48px
    opacity 0.4
  p
    margin 0
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
  .credentials
    .field
      flex 1 1 100%
  .wl-table
    .ep .ep-title
      display none
</style>
