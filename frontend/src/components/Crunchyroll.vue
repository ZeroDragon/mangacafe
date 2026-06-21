<template lang="pug">
.crunchyroll
  header.bar
    .title
      h1 Crunchyroll
      .summary(v-if="items.length")
        span {{ items.length }} series en tu lista
        span.dot ·
        span {{ counts.incomplete }} viéndose
        span.dot ·
        span {{ counts.pending }} pendientes
        span.dot ·
        span {{ counts.watched }} vistas
        span.dot ·
        span {{ counts.unstarted }} sin empezar

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
      label(for="cr-pass") Contraseña
      input#cr-pass(
        v-model="password"
        type="password"
        placeholder="••••••••"
        autocomplete="current-password"
        required)
    button.sync(type="submit" :disabled="loading || !email || !password")
      span.material-symbols-outlined {{ loading ? 'progress_activity' : 'sync' }}
      span.label {{ loading ? 'Sincronizando…' : 'Sync my list' }}

  p.error(v-if="error") {{ error }}

  Loader(v-if="loading" skeleton)

  .empty(v-else-if="synced && !items.length")
    span.material-symbols-outlined inbox
    p Tu watchlist de Crunchyroll está vacía.

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
        th Serie
        th Último episodio
        th Estado
    tbody
      tr(v-for="it in filtered" :key="it.name")
        td.name {{ it.name }}
        td.ep
          span.ep-label {{ it.label }}
          span.ep-title(v-if="it.title && it.status !== 'unstarted'")  · {{ it.title }}
        td.status
          span.badge(:class="it.status") {{ STATUS_TEXT[it.status] }}

  .empty.filtered(v-else-if="items.length")
    span.material-symbols-outlined filter_alt_off
    p No hay series en este filtro.
    button.reset(@click="filter = 'all'") Ver todo
</template>

<script>
import api from '../api.js'
import Loader from './Loader.vue'

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'incomplete', label: 'Viéndose' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'watched', label: 'Vistas' },
  { key: 'unstarted', label: 'Sin empezar' }
]

const STATUS_TEXT = {
  incomplete: 'Incompleto',
  pending: 'Pendiente',
  watched: 'Visto',
  unstarted: 'Sin empezar'
}

export default {
  name: 'Crunchyroll',
  components: { Loader },
  data () {
    return {
      email: localStorage.getItem('cr_email') || '',
      password: '',
      items: [],
      loading: false,
      synced: false,
      error: '',
      filter: 'all',
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
        localStorage.setItem('cr_email', this.email)
        this.$toast.success(`${this.items.length} series sincronizadas`)
      } catch (e) {
        const msg = e.response?.data?.error || 'No se pudo sincronizar con Crunchyroll'
        this.error = msg
      } finally {
        this.loading = false
      }
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
