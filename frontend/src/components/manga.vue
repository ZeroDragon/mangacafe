<template lang="pug">
  .header: img(:src="image")
  h1
    a(href="/"): img(src="/small2.png").logo
    span.mangaTitle {{ title }}
  .manga(v-if="title")
    .meta
      .cover
        img(:src="image")
      .info
        .bar
          .status Status: {{ status }}
          .icon(@click="openSettings"): span.material-symbols-outlined settings
        .description {{ description }}
    .chapters
      .chapter(
        v-for="(chapter, key) in chapters",
        v-bind:key="chapter"
        :class="{ read: chapter.read }"
      )
        a(:href="chapter.uri")
          span
            span.entry \#{{chapters.length - key}} 
            | {{ chapter.title.replace(title, '') }}
          span {{ chapter.pubDate}}
</template>
<script>
  import axios from 'axios'

  export default {
    data() {
      return {
        title: null,
        image: null,
        curPath: null,
        description: null,
        status: null,
        manga: null
      }
    },
    computed: {
      chapters () {
        const lastRead = this.$storage.get('mangas')[this.manga]?.lastRead || 0
        return this._chapters.map((e,i,s) => {
          return {
            ...e,
            read: lastRead >= s.length - i
          }
        })
      }
    },
    methods: {
      openSettings () {
        this.$storage.set('displaySettings', true)
      }
    },
    async beforeMount () {
      const { manga } = this.$route.params
      this.manga = manga
      const { data: { data } } = await axios.get(`${__API__}/manga/${(manga)}`)
      this.$storage.set('mangaLoaded', manga)
      this.image = data.image
      this.description = data.description
      this.status = data.status
      this._chapters = data.chapters.map((chapter, index) => {
        const { uri, title, pubDate: date } = chapter
        const pubDate = new Date(date).toLocaleDateString()
        return { uri, title, pubDate }
      })
      this.curPath = data.curPath
      this.title = data.title
    }
  }
</script>
<style lang="stylus" scoped>
  .manga
    display flex
    align-items flex-start
  .cover img
    width 100%
  .chapters
    flex-grow 1
    height calc(100vh - 100px)
    overflow-y auto
    scrollbar-color var(--primary) var(--background)
    scrollbar-width thin
  .chapter, .chapter a
    flex-grow 1
    display flex
    justify-content space-between
  .chapter a
    padding: 10px
    position relative
    &:hover
      background-color var(--primary)
  &.read
    opacity 0.5
  .description
    text-align justify
  .meta
    width 25%
    padding-right 20px
  .status
    font-weight bold
    margin 10px 0
  .logo
    width 50px
    height 50px
    border-radius 5px
    margin-right 10px
  h1
    white-space nowrap
    overflow hidden
    text-overflow ellipsis
    display flex
    align-items center
    margin-bottom 0
  .header
    display none
  @media (max-width: 600px)
    .header
      display block
      position absolute
      top 0
      left 0
      z-index -1
      opacity 0.05
      width 100%
      height 100%
      img
        width 100%
        height 100%
        object-fit cover
        object-position center
    .manga
      flex-direction column
    .meta, .chapters
      width 100%
    .meta
      padding 0
      .cover
        display none
  .entry
    font-weight 300
    font-size 10px
  .bar
    display flex
    justify-content space-between
    align-items flex-end
    .icon span
      font-size 22px
      cursor pointer
</style>
