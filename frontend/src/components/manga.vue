<script>
  import axios from 'axios'

  export default {
    data() {
      return {
        title: null,
        chapters: [],
        image: null,
        curPath: null
      }
    },
    async beforeMount () {
      const { manga } = this.$route.params
      const { data: { data } } = await axios.get(`${__API__}/manga/${(manga)}`)
      this.image = data.image
      this.chapters = data.chapters.map(chapter => {
        const { uri, title, pubDate: date } = chapter
        const pubDate = new Date(date).toLocaleDateString()
        return { uri, title, pubDate }
      })
      this.curPath = data.curPath
      this.title = data.title
    }
  }
</script>
<template lang="pug">
  h1 {{ title }}
  .manga
    img(:src="image").cover
    .chapters
      .chapter(v-for="chapter in chapters", v-bind:key="chapter")
        a(:href="chapter.uri ")
          span {{ chapter.title }}
          span {{ chapter.pubDate}}
</template>
<style lang="stylus" scoped>
  .manga
    display flex
    align-items flex-start
  .cover
    height 300px
    margin-right 20px
  .chapters
    flex-grow 1
  .chapter, .chapter a
    flex-grow 1
    display flex
    justify-content space-between
  .chapter a
    padding: 10px
</style>
