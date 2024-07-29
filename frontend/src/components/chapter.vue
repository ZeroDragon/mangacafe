<template lang="pug">
  mixin nav
    .nav(v-if="!loading")
      .prev
        .a(
          v-if="prev"
          @click="goPrev"
        ) Prev: {{prev.chapter}}
        .noEntry(v-else) Prev: None
      .curr
        | Current: {{ chapter }}
      .next
        .a(
          v-if="next"
          @click="goNext"
        ) Next: {{next.chapter}}
        .noEntry(v-else) Next: None
  .title: a(:href="'/' + manga") {{mangaTitle}}
  template.noShow
    a(:href="'/' + prev.uri" v-if="prev", ref="prev") Prev
    a(:href="'/' + next.uri" v-if="next" ref="next") Next
  +nav
  div(v-for="image in pages" v-bind:key="image")
    object(:src="imageBase[0] + `${image}`.padStart(3, '0') + '.png'")
      img(:src="imageBase[1] + `${image}`.padStart(3, '0') + '.png'")
  +nav
  .vSpacer
  .progressBar: .fill(v-bind:style="{width: `${progress}%`}")
</template>
<script>
  import axios from 'axios'

  export default {
    data() {
      return {
        mangaTitle: null,
        manga: null,
        chapter: null,
        images: [],
        prev: {},
        next: {},
        imageBase: null,
        loading: true,
        pages: 0,
        progress: 0
      }
    },
    async beforeMount () {
      const { manga, chapter, season } = this.$route.params
      const uri = [manga, chapter, season].filter(itm => itm !== '').join('/')
      this.manga = manga
      const { data: { data } } = await axios.get(`${__API__}/manga/${uri}`)
      this.prev = data.prev
      this.next = data.next
      this.chapter = chapter
      this.mangaTitle = data.title
      this.imageBase = data.imageBase
      this.loading = false
      this.pages = data.pages
      this.index = data.index
      this.mangaFromMem = this.$storage.get('mangas')[this.manga] || { lastRead: 0 }
    },
    mounted () {
      window.addEventListener('keydown', this.handleKeyDown)
      window.addEventListener('scroll', this.handleScroll)
    },
    beforeUnmount () {
      window.removeEventListener('keydown', this.handleKeyDown)
      window.removeEventListener('scroll', this.handleScroll)
    },
    methods: {
      goNext () {
        this.mangaFromMem.lastRead = this.index + 1
        this.$storage.set('mangas', {
          ...this.$storage.get('mangas'),
          [this.manga]: this.mangaFromMem
        })
        this.$refs.next.click()
      },
      goPrev () {
        this.$refs.prev.click()
      },
      handleKeyDown (e) {
        if (e.key === 'ArrowLeft' && this.prev) {
          this.goPrev()
        }
        if (e.key === 'ArrowRight' && this.next) {
          this.goNext()
        }
      },
      handleScroll () {
        this.progress = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) * 100
      }
    }
  }
</script>
<style lang="stylus" scoped>
  img
    width 100%
  .title
    text-align center
    font-size 1.2em
    padding 10px
    font-weight bold
    width 90%
    white-space nowrap
    overflow hidden
    text-overflow ellipsis
    margin auto
  .nav
    display flex
    justify-content space-between
    align-items center
    padding 10px
    margin-bottom 10px
    .a
      cursor pointer
      width 100%
    .a, .noEntry
      display block
      padding 10px
    .prev
      background-color olive
    .curr
      font-weight bold
      padding 10px
    .next
      background-color tomato
    & > div
      width: calc(100%/3)
      text-align: center
  .noShow
    display none
  .vSpacer
    height 10px
  .progressBar
    position fixed
    bottom 0
    left 0
    width 100%
    height 7px
    background-color var(--background)
    z-index 100
    .fill
      content ''
      display block
      position absolute
      bottom 0
      width 0%
      height 5px
      background-color var(--primary)
</style>
