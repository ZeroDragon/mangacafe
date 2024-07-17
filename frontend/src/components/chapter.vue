<script>
  import axios from 'axios'

  const leftPad = (str, len, ch = '0') => {
    const [left, ...rest] = str.split('.')
    const construct = [`${ch.repeat(len)}${left}`.slice(-len)]
    if (rest.length) construct.push(rest.join('.'))
    return construct.join('.')
  }

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
        manga: null,
        chapter: null,
        images: []
      }
    },
    async beforeMount () {
      const { manga, chapter } = this.$route.params
      this.manga = manga
      const { data } = await axios.get(`${__API__}/manga/${(manga)}/${chapter}`)
      this.chapter = `${data.title}: ${chapter}`
      const chapterPadded = leftPad(chapter, 4)
      loadImageWithId(data.curPath, `${manga}/${chapterPadded}`, this.images)
    }
  }
</script>
<template lang="pug">
  h1
    a(:href="'/manga/' + manga") {{ chapter }}
  div(v-for="image in images" v-bind:key="image")
    img(:src="image")
</template>
