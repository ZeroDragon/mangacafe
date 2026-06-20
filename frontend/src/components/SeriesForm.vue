<template lang="pug">
.series-form
  h1 {{ isEdit ? 'Editar serie' : 'Nueva serie' }}
  form.card(@submit.prevent="submit")
    label
      span Tipo
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
      span Nombre
      input(v-model="form.name" type="text" required)
    label
      span URL (dónde la lees/ves)
      input(v-model="form.url" type="url" placeholder="https://...")
    label
      span URL de la portada
      input(v-model="form.cover_url" type="url" placeholder="https://...")
    label
      span Capítulo actual
      input(v-model.number="form.current_chapter" type="number" min="0" step="1")
    label
      span URL del feed RSS (opcional)
      input(v-model="form.rss_url" type="url" placeholder="https://...")
    .actions
      button(type="submit" :disabled="loading") {{ isEdit ? 'Guardar' : 'Crear' }}
      button.cancel(type="button" @click="$router.push('/series')") Cancelar
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
  async mounted () {
    if (this.isEdit) await this.load()
  },
  methods: {
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
          rss_url: s.rss_url || ''
        }
      } catch (e) {
        this.error = (e.response && e.response.data && e.response.data.error) || 'No se pudo cargar la serie'
      }
    },
    validate () {
      const errs = []
      if (!this.form.name.trim()) errs.push('El nombre es obligatorio')
      if (this.form.current_chapter === '' || this.form.current_chapter === null || Number(this.form.current_chapter) < 0) {
        errs.push('El capítulo actual debe ser >= 0')
      }
      for (const f of ['url', 'cover_url', 'rss_url']) {
        const v = this.form[f] && this.form[f].trim()
        if (v && !/^https?:\/\//.test(v)) errs.push(`${f} debe ser una URL http(s)`)
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
      const payload = {
        type: this.form.type,
        name: this.form.name.trim(),
        url: this.form.url.trim() || null,
        cover_url: this.form.cover_url.trim() || null,
        current_chapter: Number(this.form.current_chapter) || 0,
        rss_url: this.form.rss_url.trim() || null
      }
      try {
        if (this.isEdit) {
          await api.put(`/api/series/${this.$route.params.id}`, payload)
          this.$toast.success('Serie actualizada')
        } else {
          await api.post('/api/series', payload)
          this.$toast.success('Serie creada')
        }
        this.$router.push('/series')
      } catch (e) {
        this.error = (e.response && e.response.data && e.response.data.error) || 'Error inesperado'
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
