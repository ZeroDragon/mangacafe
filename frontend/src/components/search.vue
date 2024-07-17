<script>
import axios from 'axios'

const titleize = str => {
  return str.split(' ').map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1)
  }).join('-')
}

export default {
  data() {
    return {
      loading: false,
      manga: null,
      chapters: [],
      search: 'jujutsu kaisen'
    }
  },
  methods: {
    async searchManga() {
      this.loading = true
      console.log(titleize(this.search))
      const url = `${__API__}/manga/${titleize(this.search)}`
      const response = await axios.get(url)
      this.loading = false
      this.manga = response.data
    }
  }
}
</script>
<template lang="pug">
  input(type="text", v-model="search", placeholder="Buscar manga", @keyup.enter="searchManga")
  button(@click="searchManga") Buscar
  div(v-if="loading") Cargando...
  div(v-else)
    div(v-if="manga")
      h1 {{ manga.title }}
      img(:src="manga.image")
      div(v-for="chapter, index in manga.chapters", v-bind:key="index")
        a(:href="'/manga/' + chapter.guid")
          img(:src="chapter.image")
          | {{ chapter.title }}

</template>
