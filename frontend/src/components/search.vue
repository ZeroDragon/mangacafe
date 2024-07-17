<script>
import axios from 'axios'

export default {
  data() {
    return {
      matches: [],
      search: ''
    }
  },
  methods: {
    async searchManga() {
      const url = `${__API__}/search/`
      const { data: { error, results } } = await axios.post(url, { query: this.search })
      if (error) {
        console.error(error)
        return
      }
      this.matches = results
        .map(([guid, title]) => ({
          guid,
          title,
          image: `https://temp.compsci88.com/cover/${guid}.jpg`
        }))
    }
  }
}
</script>
<template lang="pug">
  input(type="text", v-model="search", placeholder="Buscar manga", @keyup.enter="searchManga")
  .match(v-for="match in matches", v-bind:key="match.guid")
    a(:href="'/manga/' + match.guid"): img(:src="match.image")
    a(:href="'/manga/' + match.guid") {{ match.title }}
</template>
<style lang="stylus" scoped>
img
  width 50px
  height 50px
  object-fit cover
.match
  display flex
  align-items center
  img
    margin-right 10px
</style>
