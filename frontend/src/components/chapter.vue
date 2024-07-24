<script>
  import axios from 'axios'

  const loadImageWithId = (path, images) => {
    const tryLoadNextImage = current => {
      const currentPadded = `${current}`.padStart(3, '0')
      const img = new Image()
      const src = `${path}${currentPadded}.png`
      img.src = src
      img.onload = _ => {
        images.push(src)
        tryLoadNextImage(current + 1)
      }
    }
    tryLoadNextImage(1)
  }

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
        loading: true
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
      loadImageWithId(this.imageBase, this.images)
    }
  }
</script>
<template lang="pug">
  .title: a(:href="'/' + manga") {{mangaTitle}}
  .nav(v-if="!loading")
    .prev
      a(:href="'/' + prev.uri" v-if="prev") Prev: {{prev.chapter}}
      .noEntry(v-else) Prev: None
    .curr
      | Current: {{ chapter }}
    .next
      a(:href="'/' + next.uri" v-if="next") Next: {{next.chapter}}
      .noEntry(v-else) Next: None
  div(v-for="image in images" v-bind:key="image")
    img(:src="image")
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
