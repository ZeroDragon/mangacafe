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
        pages: 0
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
    },
    mounted () {
      window.addEventListener('keydown', this.handleKeyDown)
    },
    beforeDestroy () {
      window.addEventListener('keydown', this.handleKeyDown)
    },
    methods: {
      handleKeyDown (e) {
        if (e.key === 'ArrowLeft' && this.prev) {
          this.$refs.prev.click()
        }
        if (e.key === 'ArrowRight' && this.next) {
          this.$refs.next.click()
        }
      }
    }
  }
</script>
<template lang="pug">
  mixin nav
    .nav(v-if="!loading")
      .prev
        a(
          :href="'/' + prev.uri"
          v-if="prev",
          ref="prev"
        ) Prev: {{prev.chapter}}
        .noEntry(v-else) Prev: None
      .curr
        | Current: {{ chapter }}
      .next
        a(
          :href="'/' + next.uri"
          v-if="next"
          ref="next"
        ) Next: {{next.chapter}}
        .noEntry(v-else) Next: None
  .title: a(:href="'/' + manga") {{mangaTitle}}
  +nav
  div(v-for="image in pages" v-bind:key="image")
    object(:src="imageBase[0] + `${image}`.padStart(3, '0') + '.png'")
      img(:src="imageBase[1] + `${image}`.padStart(3, '0') + '.png'")
  +nav
</template>
<style lang="stylus" scoped>
  img
    width 100%
  .title
    text-align: center
    font-size: 1.2em
    padding: 10px
    font-weight: bold
  .nav
    display flex
    justify-content space-between
    padding 10px
    margin-bottom 10px
    a
      text-decoration none
      width 100%
    a, .noEntry
      display block
      padding: 10px
    .prev
      background-color: olive
    .curr
      font-weight bold
      padding: 10px
    .next
      background-color: tomato
    & > div
      width: calc(100%/3)
      text-align: center
</style>
