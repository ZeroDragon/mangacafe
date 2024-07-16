<script>
  import axios from 'axios'

  const loadImageWithId = (path, chapter, images) => {
    const tryLoadNextImage = current => {
      const currentPadded = `${current}`.padStart(3, '0')
      const img = new Image()
      const src = `//${path}/manga/${chapter}-${currentPadded}.png`
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
        chapter: null,
        images: []
      }
    },
    async beforeMount () {
      const { manga, chapter } = this.$route.params
      const { data } = await axios.get(`http://localhost:8000/api/manga/${(manga)}`)
      this.chapter = `${data.title}: ${chapter}`
      loadImageWithId(data.curPath, `${manga}/${chapter}`, this.images)
    }
  }
</script>
<template lang="pug">
  .manga
    h1 {{ chapter }}
    div(v-for="image in images" v-bind:key="image")
      img(:src="image")
</template>
