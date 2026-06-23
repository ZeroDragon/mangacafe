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
          @click="form.type = 'manga'") Graphic novel
        button(
          type="button"
          :class="{ active: form.type === 'anime' }"
          @click="form.type = 'anime'") Show
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
      .hint Progress is tracked automatically as you mark chapters seen.
    label(v-if="form.type === 'anime'")
      span IMDB episodes URL (optional)
      input(v-model="form.imdb_url" type="url" placeholder="https://www.imdb.com/title/tt.../episodes/?season=2")
    label(v-else)
      span {{ advanced ? 'Site URL to scrape' : 'Feed URL or series page (optional)' }}
      input(v-model="form.rss_url" type="url" placeholder="https://site.com/feed.xml or https://comivex.com/series/…")
    template(v-if="form.type === 'manga'")
      button.advanced-toggle(type="button" @click="advanced = !advanced")
        span.material-symbols-outlined {{ advanced ? 'expand_less' : 'expand_more' }}
        span {{ advanced ? 'Hide advanced' : 'Advanced mode' }}
      template(v-if="advanced")
        label
          span Selector
          input(v-model="form.source_selector" type="text" placeholder="table tr td a")
          .hint CSS selector for the chapter links. Use DevTools → Inspect to find it.
        label
          span URL attribute
          input(v-model="form.source_url_attr" type="text" placeholder="href")
          .hint Which attribute holds the link URL. Usually 'href'.
        label
          span Label attribute
          input(v-model="form.source_label_attr" type="text" placeholder="text")
          .hint Use 'text' for the visible text, or an attribute name like 'title'.
        label.reverse-row
          span Reverse order
          .reverse-toggle
            input(:id="'source-reverse'" v-model="form.source_reverse" type="checkbox")
            label(:for="'source-reverse'")
        .hint Activate if the site lists newest chapters first.
    .actions
      button(type="submit" :disabled="loading") {{ isEdit ? 'Save' : 'Create' }}
      button.preview-btn(
        v-if="canPreview"
        type="button"
        :disabled="preview.loading"
        @click="runPreview")
        span.material-symbols-outlined(v-if="!preview.loading") visibility
        span {{ preview.loading ? 'Loading…' : 'Preview' }}
      button.cancel(type="button" @click="$router.push('/series')") Cancel
    p.error(v-if="error") {{ error }}
  .preview-panel(v-if="preview.items.length || preview.error")
    .preview-header
      span.count(v-if="preview.count") {{ preview.count }} items found
      span.error(v-if="preview.error") {{ preview.error }}
    .preview-list(v-if="preview.items.length")
      .preview-item(v-for="item in preview.items" :key="item.link")
        span.title {{ item.title }}
        span.link {{ item.link }}
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
        imdb_url: '',
        rss_url: '',
        source_selector: '',
        source_url_attr: '',
        source_label_attr: '',
        source_reverse: false
      },
      advanced: false,
      loading: false,
      error: '',
      preview: { loading: false, error: '', items: [], count: 0 }
    }
  },
  computed: {
    isEdit () {
      return !!this.$route.params.id
    },
    canPreview () {
      return this.form.type === 'manga' &&
        this.advanced &&
        this.form.rss_url.trim() &&
        this.form.source_selector.trim()
    }
  },
  watch: {
    // Al toggleear el tipo, limpiamos el campo del otro tipo para no mandar
    // basura (el backend rechazaría el campo equivocado para el type).
    'form.type' (next, prev) {
      if (!prev || next === prev) return
      if (next === 'anime') {
        this.form.rss_url = ''
        this.form.source_selector = ''
        this.form.source_url_attr = ''
        this.form.source_label_attr = ''
        this.form.source_reverse = false
        this.advanced = false
      } else {
        this.form.imdb_url = ''
      }
      this.resetPreview()
    },
    // Cualquier cambio en los inputs de source invalida el preview previo (stale).
    'form.source_selector' () { this.resetPreview() },
    'form.source_url_attr' () { this.resetPreview() },
    'form.source_label_attr' () { this.resetPreview() },
    'form.source_reverse' () { this.resetPreview() },
    'form.rss_url' () { this.resetPreview() }
  },
  async mounted () {
    if (this.isEdit) await this.load()
    else this.prefillFromQuery()
  },
  methods: {
    resetPreview () {
      this.preview = { loading: false, error: '', items: [], count: 0 }
    },
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
    },
    // 4 inputs → objeto source_config (para enviar al backend y persistir).
    buildConfig () {
      const cfg = { selector: this.form.source_selector.trim() }
      if (this.form.source_url_attr.trim()) cfg.url_attr = this.form.source_url_attr.trim()
      if (this.form.source_label_attr.trim()) cfg.label_attr = this.form.source_label_attr.trim()
      if (this.form.source_reverse) cfg.reverse = true
      return cfg
    },
    // objeto source_config → 4 inputs (para pre-poblar el form en edición).
    applyConfig (cfg) {
      this.form.source_selector = (cfg && cfg.selector) || ''
      this.form.source_url_attr = (cfg && cfg.url_attr) || ''
      this.form.source_label_attr = (cfg && cfg.label_attr) || ''
      this.form.source_reverse = !!(cfg && cfg.reverse)
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
          imdb_url: s.imdb_url || '',
          rss_url: s.rss_url || '',
          source_selector: '',
          source_url_attr: '',
          source_label_attr: '',
          source_reverse: false
        }
        if (s.source_config) {
          this.applyConfig(s.source_config)
          this.advanced = true
        }
      } catch (e) {
        this.error = (e.response && e.response.data && e.response.data.error) || 'Could not load the series'
      }
    },
    async runPreview () {
      this.preview = { loading: true, error: '', items: [], count: 0 }
      try {
        const res = await api.post('/api/sources/preview', {
          url: this.form.rss_url.trim(),
          config: this.buildConfig()
        })
        this.preview = {
          loading: false,
          error: '',
          items: res.data.items || [],
          count: res.data.count || 0
        }
      } catch (e) {
        this.preview = {
          loading: false,
          error: (e.response && e.response.data && e.response.data.error) || 'Preview failed',
          items: [],
          count: 0
        }
      }
    },
    validate () {
      const errs = []
      if (!this.form.name.trim()) errs.push('Name is required')
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
        imdb_url: isAnime ? (this.form.imdb_url.trim() || null) : null,
        rss_url: isAnime ? null : (this.form.rss_url.trim() || null),
        source_config: isAnime
          ? null
          : (this.advanced && this.form.source_selector.trim() ? this.buildConfig() : null)
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
.hint
  font-size 11px
  opacity 0.6
  font-style italic
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
.advanced-toggle
  display flex
  align-items center
  gap 6px
  background transparent
  border none
  color var(--primary)
  cursor pointer
  font-size 13px
  padding 4px 0
  align-self flex-start
  .material-symbols-outlined
    font-size 18px
.reverse-row
  flex-direction row
  align-items center
  justify-content space-between
  gap 12px
.reverse-toggle
  position relative
  display inline-block
  input[type="checkbox"]
    opacity 0
    width 0
    height 0
    position absolute
  input[type="checkbox"] + label
    display block
    width 38px
    height 20px
    background rgba(255,255,255,0.12)
    border-radius 10px
    cursor pointer
    position relative
    transition background 0.15s
  input[type="checkbox"] + label::after
    content ''
    position absolute
    top 2px
    left 2px
    width 16px
    height 16px
    background #fff
    border-radius 50%
    transition transform 0.15s
  input[type="checkbox"]:checked + label
    background var(--primary)
  input[type="checkbox"]:checked + label::after
    transform translateX(18px)
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
.preview-btn
  background transparent
  border 1px solid var(--primary)
  color var(--primary)
  padding 10px
  border-radius 6px
  cursor pointer
  font-size 14px
  display flex
  align-items center
  gap 4px
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
.preview-panel
  margin-top 16px
  background rgba(0,0,0,0.25)
  border 1px solid rgba(255,255,255,0.08)
  border-radius 8px
  padding 12px
.preview-header
  display flex
  justify-content space-between
  align-items center
  margin-bottom 8px
  font-size 13px
  .count
    color var(--primary)
    font-weight 500
  .error
    color var(--danger)
    margin 0
    font-size 12px
.preview-list
  max-height 320px
  overflow-y auto
  display flex
  flex-direction column
  gap 4px
.preview-item
  display flex
  flex-direction column
  padding 6px 8px
  border-radius 4px
  background rgba(255,255,255,0.03)
  .title
    font-size 13px
    color var(--foreground)
  .link
    font-size 11px
    opacity 0.5
    word-break break-all
</style>
