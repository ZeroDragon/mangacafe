<template lang="pug">
.reels
  header.bar
    .title
      h1 Bookmarks
      .summary(v-if="!loading")
        span {{ toWatch.length }} to watch
        span.dot ·
        span {{ watched.length }} watched
    .controls
      span.material-symbols-outlined.smart bookmark

  p.error(v-if="error") {{ error }}

  // Form de alta
  form.add(@submit.prevent="addReel")
    .field.url-field
      span.material-symbols-outlined link
      input(
        v-model="newUrl"
        type="url"
        placeholder="Paste a bookmark URL"
        aria-label="Bookmark URL"
        required)
    .field.title-field
      input(
        v-model="newTitle"
        type="text"
        placeholder="Title (optional)"
        aria-label="Optional reel title")
    button.add-btn(:disabled="adding || !newUrl.trim()")
      span.material-symbols-outlined {{ adding ? 'progress_activity' : 'add' }}
      span {{ adding ? 'Adding…' : 'Add' }}

  Loader(v-if="loading" skeleton)

  template(v-else)
    // --- To watch ---
    section.list-section(v-if="toWatch.length")
      h2.section-title To watch ({{ toWatch.length }})
      ul.items
        li.item(v-for="r in toWatch" :key="r.id")
          span.material-symbols-outlined.thumb-glyph bookmark
          .item-body(v-if="editingId !== r.id")
            a.title(
              :href="r.url"
              target="_blank"
              rel="noopener"
              :title="r.url"
              @click="toggleSeen(r)") {{ displayTitle(r) }}
            .url-fallback(v-if="!r.title") {{ shortUrl(r.url) }}
          .item-body.edit(v-else)
            input.edit-url(v-model="editUrl" type="url" placeholder="URL")
            input.edit-title(v-model="editTitle" type="text" placeholder="Title (optional)")
            .edit-actions
              button.btn(@click="saveEdit(r)") Save
              button.btn.ghost(@click="cancelEdit") Cancel
          .item-actions(v-if="editingId !== r.id")
            button.icon-btn(@click="startEdit(r)" title="Edit")
              span.material-symbols-outlined edit
            button.icon-btn.primary(@click="markSeen(r)" title="Mark as watched")
              span.material-symbols-outlined check

    // --- Watched ---
    section.list-section(v-if="watched.length")
      h2.section-title.muted Watched ({{ watched.length }})
      ul.items
        li.item.watched(v-for="r in watched" :key="r.id")
          span.material-symbols-outlined.thumb-glyph bookmark
          .item-body(v-if="editingId !== r.id")
            a.title(
              :href="r.url"
              target="_blank"
              rel="noopener"
              :title="r.url"
              @click="toggleSeen(r)") {{ displayTitle(r) }}
            .url-fallback(v-if="!r.title") {{ shortUrl(r.url) }}
          .item-body.edit(v-else)
            input.edit-url(v-model="editUrl" type="url" placeholder="URL")
            input.edit-title(v-model="editTitle" type="text" placeholder="Title (optional)")
            .edit-actions
              button.btn(@click="saveEdit(r)") Save
              button.btn.ghost(@click="cancelEdit") Cancel
          .item-actions(v-if="editingId !== r.id")
            button.icon-btn(@click="startEdit(r)" title="Edit")
              span.material-symbols-outlined edit
            button.icon-btn.danger(@click="remove(r)" title="Delete")
              span.material-symbols-outlined delete
            button.icon-btn.primary(@click="markUnseen(r)" title="Mark as pending")
              span.material-symbols-outlined undo

    .empty(v-if="!loading && !items.length")
      span.material-symbols-outlined bookmark
      p No bookmarks yet. Paste a URL above to save it for later.
</template>

<script>
import api from '../api.js'
import Loader from './Loader.vue'

export default {
  name: 'Bookmarks',
  components: { Loader },
  data () {
    return {
      items: [],
      loading: false,
      adding: false,
      error: '',
      newUrl: '',
      newTitle: '',
      editingId: null,
      editUrl: '',
      editTitle: ''
    }
  },
  computed: {
    toWatch () {
      return this.items.filter(r => !r.seen)
    },
    watched () {
      return this.items.filter(r => r.seen)
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
        const res = await api.get('/api/reels')
        this.items = res.data.data || []
      } catch (e) {
        this.error = 'Could not load reels'
      } finally {
        this.loading = false
      }
    },
    displayTitle (r) {
      return r.title || this.shortUrl(r.url)
    },
    shortUrl (url) {
      if (!url) return ''
      try {
        const u = new URL(url)
        const path = u.pathname.length > 30 ? u.pathname.slice(0, 30) + '…' : u.pathname
        return `${u.host}${path}`
      } catch (e) {
        return url.length > 50 ? url.slice(0, 50) + '…' : url
      }
    },
    async addReel () {
      const url = this.newUrl.trim()
      if (!url) return
      this.adding = true
      try {
        const payload = { url }
        if (this.newTitle.trim()) payload.title = this.newTitle.trim()
        const res = await api.post('/api/reels', payload)
        if (res.data.skipped) {
          this.$toast.info('That bookmark was already saved')
        } else {
          this.$toast.success('Bookmark saved')
        }
        this.newUrl = ''
        this.newTitle = ''
        await this.fetch()
      } catch (e) {
        this.$toast.error(e.response?.data?.error || 'Could not save reel')
      } finally {
        this.adding = false
      }
    },
    startEdit (r) {
      this.editingId = r.id
      this.editUrl = r.url
      this.editTitle = r.title || ''
    },
    cancelEdit () {
      this.editingId = null
      this.editUrl = ''
      this.editTitle = ''
    },
    async saveEdit (r) {
      try {
        const fields = {}
        if (this.editUrl.trim() && this.editUrl.trim() !== r.url) fields.url = this.editUrl.trim()
        const newTitle = this.editTitle.trim()
        const currentTitle = r.title || ''
        // Permitimos mandar title=null para limpiar (si el input quedó vacío)
        if (newTitle !== currentTitle) fields.title = newTitle || null
        if (Object.keys(fields).length === 0) {
          this.cancelEdit()
          return
        }
        await api.put(`/api/reels/${r.id}`, fields)
        this.$toast.success('Bookmark updated')
        this.cancelEdit()
        await this.fetch()
      } catch (e) {
        this.$toast.error(e.response?.data?.error || 'Could not update')
      }
    },
    // Acción del título: marca visto/pendiente (toggle). Se invoca al click del
    // <a> que además abre el link en tab nueva (no.preventDefault).
    toggleSeen (r) {
      return r.seen ? this.markUnseen(r) : this.markSeen(r)
    },
    async markSeen (r) {
      try {
        await api.post(`/api/reels/${r.id}/seen`)
        this.$toast.success('Marked as watched')
        await this.fetch()
      } catch (e) {
        this.$toast.error('Could not update')
      }
    },
    async markUnseen (r) {
      try {
        await api.delete(`/api/reels/${r.id}/seen`)
        this.$toast.success('Moved back to watch')
        await this.fetch()
      } catch (e) {
        this.$toast.error('Could not update')
      }
    },
    async remove (r) {
      if (!confirm('Delete this reel?')) return
      try {
        await api.delete(`/api/reels/${r.id}`)
        this.$toast.success('Bookmark deleted')
        await this.fetch()
      } catch (e) {
        this.$toast.error('Could not delete')
      }
    }
  }
}
</script>

<style lang="stylus" scoped>
.reels
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
  align-items center
  .smart
    font-size 28px
    opacity 0.6
.add
  display flex
  gap 8px
  margin-bottom 24px
  flex-wrap wrap
  .field
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
      flex 1
      min-width 0
      width 100%
      background transparent
      border none
      color var(--foreground)
      padding 8px 4px
      font-size 14px
      appearance none
      -webkit-appearance none
      &:focus
        outline none

  .url-field
    flex 2
    min-width 240px
  .title-field
    flex 3
    min-width 240px
  .add-btn
    display inline-flex
    align-items center
    gap 6px
    background var(--primary)
    border none
    color #fff
    padding 8px 16px
    border-radius 6px
    cursor pointer
    font-size 14px
    &:hover:not(:disabled)
      background lighten(#2b5278, 12%)
    &:disabled
      opacity 0.5
      cursor not-allowed
    .material-symbols-outlined
      font-size 18px
.list-section
  margin-bottom 28px
.section-title
  font-weight 400
  font-size 13px
  opacity 0.75
  margin 0 0 12px
  text-transform uppercase
  letter-spacing 0.5px
  &.muted
    opacity 0.5
.items
  list-style none
  padding 0
  margin 0
.item
  display flex
  align-items flex-start
  gap 12px
  padding 10px 4px
  border-bottom 1px solid rgba(255,255,255,0.06)
  &.watched
    opacity 0.55
    .title
      text-decoration line-through
.thumb-glyph
  width 48px
  height 64px
  border-radius 4px
  flex-shrink 0
  background rgba(0,0,0,0.3)
  display flex
  align-items center
  justify-content center
  font-size 28px
  opacity 0.5
.item-body
  flex 1
  min-width 0
  display flex
  flex-direction column
  gap 2px
  &.edit
    gap 6px
  .title
    font-size 14px
    color inherit
    text-decoration none
    word-break break-word
    overflow-wrap anywhere
    cursor pointer
    &:hover
      text-decoration underline
  .url-fallback
    font-size 12px
    opacity 0.5
    word-break break-all
    overflow-wrap anywhere
  .edit-url, .edit-title
    background rgba(0,0,0,0.25)
    border 1px solid rgba(255,255,255,0.12)
    color var(--foreground)
    padding 6px 8px
    border-radius 4px
    font-size 13px
    width 100%
    box-sizing border-box
    appearance none
    -webkit-appearance none
    &:focus
      outline none
      border-color var(--primary)
  .edit-actions
    display flex
    gap 6px
.item-actions
  display flex
  align-items center
  gap 4px
  flex-shrink 0
.icon-btn
  display inline-flex
  color inherit
  background transparent
  border none
  cursor pointer
  padding 6px
  border-radius 4px
  .material-symbols-outlined
    font-size 20px
.icon-btn:hover
  background rgba(255,255,255,0.08)
.icon-btn.primary
  color var(--primary)
.icon-btn.danger:hover
  color var(--danger)
.btn
  background rgba(255,255,255,0.1)
  border 1px solid rgba(255,255,255,0.15)
  color var(--foreground)
  padding 6px 12px
  border-radius 4px
  cursor pointer
  font-size 13px
  &:hover
    background rgba(255,255,255,0.15)
  &.ghost
    background transparent
    border-color rgba(255,255,255,0.08)
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
.error
  color var(--danger)
  text-align center
@media (max-width 560px)
  .add
    .url-field, .title-field
      min-width 100%
      flex-basis 100%
</style>
