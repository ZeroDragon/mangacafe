<template lang="pug">
.series-form
  h1 {{ isEdit ? 'Edit series' : 'New series' }}
  form.card(@submit.prevent="submit")
    label
      span Type
      .type-toggle
        button(
          type="button"
          :class="{ active: form.type === 'manga' }"
          @click="form.type = 'manga'") Manga
        button(
          type="button"
          :class="{ active: form.type === 'anime' }"
          @click="form.type = 'anime'") Anime
    label
      span Name
      input(v-model="form.name" type="text" required)
    label
      span URL (where you read/watch it)
      input(v-model="form.url" type="url" placeholder="https://...")
    label
      span Cover URL
      input(v-model="form.cover_url" type="url" placeholder="https://...")
    label
      span Current chapter
      input(v-model.number="form.current_chapter" type="number" min="0" step="1")
    label(v-if="form.type === 'anime'")
      span IMDB episodes URL (optional)
      input(v-model="form.imdb_url" type="url" placeholder="https://www.imdb.com/title/tt.../episodes/?season=2")
    label(v-else)
      span RSS feed URL (optional)
      input(v-model="form.rss_url" type="url" placeholder="https://manga-site.com/feed")
    .actions
      button(type="submit" :disabled="loading") {{ isEdit ? 'Save' : 'Create' }}
      button.cancel(type="button" @click="$router.push('/series')") Cancel
    p.error(v-if="error") {{ error }}
</template>

<script>
import api from '../api.js'

export default {
  name: 'SeriesForm',
  data () {
    return {
      form: {
        type: 'manga',
        name: '',
        url: '',
        cover_url: '',
        current_chapter: 0,
        imdb_url: '',
        rss_url: ''
      },
      loading: false,
      error: ''
    }
  },
  computed: {
    isEdit () {
      return !!this.$route.params.id
    }
  },
  watch: {
    // Al toggleear el tipo, limpiamos el campo del otro tipo para no mandar
    // basura (el backend rechazaría el campo equivocado para el type).
    'form.type' (next, prev) {
      if (!prev || next === prev) return
      if (next === 'anime') this.form.rss_url = ''
      else this.form.imdb_url = ''
    }
  },
  async mounted () {
    if (this.isEdit) await this.load()
    else this.prefillFromQuery()
  },
  methods: {
    // Pre-puebla el form desde query params (uso típico: botón "Add" en el
    // listado de Crunchyroll). Solo si el query trae los campos; type default
    // 'anime' cuando viene de ahí.
    prefillFromQuery () {
      const q = this.$route.query || {}
      if (!Object.keys(q).length) return
      if (q.type === 'anime' || q.type === 'manga') this.form.type = q.type
      if (typeof q.name === 'string' && q.name) this.form.name = q.name
      if (typeof q.url === 'string' && q.url) this.form.url = q.url
      if (typeof q.cover_url === 'string' && q.cover_url) this.form.cover_url = q.cover_url
      if (typeof q.imdb_url === 'string' && q.imdb_url) this.form.imdb_url = q.imdb_url
      if (typeof q.rss_url === 'string' && q.rss_url) this.form.rss_url = q.rss_url
      if (q.current_chapter !== undefined && q.current_chapter !== null && q.current_chapter !== '') {
        this.form.current_chapter = Number(q.current_chapter) || 0
      }
    },
    async load () {
      try {
        const res = await api.get(`/api/series/${this.$route.params.id}`)
        const s = res.data.data
        this.form = {
          type: s.type,
          name: s.name,
          url: s.url || '',
          cover_url: s.cover_url || '',
          current_chapter: s.current_chapter,
          imdb_url: s.imdb_url || '',
          rss_url: s.rss_url || ''
        }
      } catch (e) {
        this.error = (e.response && e.response.data && e.response.data.error) || 'Could not load the series'
      }
    },
    validate () {
      const errs = []
      if (!this.form.name.trim()) errs.push('Name is required')
      if (this.form.current_chapter === '' || this.form.current_chapter === null || Number(this.form.current_chapter) < 0) {
        errs.push('Current chapter must be >= 0')
      }
      const urlFields = ['url', 'cover_url']
      if (this.form.type === 'anime') urlFields.push('imdb_url')
      else urlFields.push('rss_url')
      for (const f of urlFields) {
        const v = this.form[f] && this.form[f].trim()
        if (v && !/^https?:\/\//.test(v)) errs.push(`${f} must be an http(s) URL`)
      }
      return errs
    },
    async submit () {
      this.error = ''
      const errs = this.validate()
      if (errs.length) {
        this.error = errs.join('. ')
        return
      }
      this.loading = true
      const isAnime = this.form.type === 'anime'
      const payload = {
        type: this.form.type,
        name: this.form.name.trim(),
        url: this.form.url.trim() || null,
        cover_url: this.form.cover_url.trim() || null,
        current_chapter: Number(this.form.current_chapter) || 0,
        imdb_url: isAnime ? (this.form.imdb_url.trim() || null) : null,
        rss_url: isAnime ? null : (this.form.rss_url.trim() || null)
      }
      try {
        if (this.isEdit) {
          await api.put(`/api/series/${this.$route.params.id}`, payload)
          this.$toast.success('Series updated')
        } else {
          await api.post('/api/series', payload)
          this.$toast.success('Series created')
        }
        this.$router.push('/series')
      } catch (e) {
        this.error = (e.response && e.response.data && e.response.data.error) || 'Unexpected error'
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style lang="stylus" scoped>
.series-form
  max-width 520px
  margin 24px auto
  h1
    font-weight 300
    margin-bottom 16px
.card
  background rgba(255,255,255,0.04)
  border 1px solid rgba(255,255,255,0.08)
  border-radius 10px
  padding 20px
  display flex
  flex-direction column
  gap 12px
label
  display flex
  flex-direction column
  gap 4px
  font-size 13px
  opacity 0.85
input
  background rgba(0,0,0,0.25)
  border 1px solid rgba(255,255,255,0.1)
  border-radius 6px
  padding 8px 10px
  color var(--foreground)
  font-size 14px
  &:focus
    outline none
    border-color var(--primary)
.type-toggle
  display flex
  gap 8px
  button
    flex 1
    background transparent
    border 1px solid rgba(255,255,255,0.12)
    color var(--foreground)
    padding 8px
    border-radius 6px
    cursor pointer
    font-size 14px
    &.active
      border-color var(--primary)
      background rgba(43,82,120,0.3)
.actions
  display flex
  gap 8px
  margin-top 4px
button[type="submit"]
  background var(--primary)
  border none
  color #fff
  padding 10px
  border-radius 6px
  cursor pointer
  font-size 14px
  flex 1
  &:disabled
    opacity 0.5
    cursor not-allowed
.cancel
  background transparent
  border 1px solid rgba(255,255,255,0.12)
  color var(--foreground)
  padding 10px
  border-radius 6px
  cursor pointer
  font-size 14px
  &:hover
    background rgba(255,255,255,0.08)
.error
  color var(--danger)
  margin 0
  font-size 13px
  text-align center
</style>
