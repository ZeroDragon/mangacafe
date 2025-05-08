<template lang="pug">
  .search
    .header: img(src="/small2.png")
    .inputZone
      span.material-symbols-outlined search
      input(
        type="text",
        v-model="search",
        :placeholder="placeH",
        @keyup.enter="searchManga",
        @keyup="updateAction"
        ref="searchInput"
      )
    .noMatches(v-if="!matches.length && search.length > 3 && !searching") No matches found >.<
    //- .randomBtn(v-if="search.length === 0" @click="goRandom") Or try a random manga
    .matches
      a.match(
        v-for="match in matches", v-bind:key="match.guid"
        :href="match.guid"
      )
        img(:src="match.image")
        .itemTitle {{ match.title }}
</template>
<script>
  import axios from 'axios'

  export default {
    data() {
      return {
        searching: false,
        matches: [],
        search: '',
        timer: null,
        placeH: '',
        placeTimer: null
      }
    },
    methods: {
      async searchManga() {
        if (this.search.length < 3) {
          this.matches = []
          return
        }
        this.searching = true
        const url = `${__API__}/search/`
        const { data: { error, results } } = await axios.post(url, { query: this.search })
        if (error) {
          this.searching = false
          console.error(error)
          return
        }
        this.matches = results
          .map(([guid, title]) => ({
            guid,
            title,
            image: `${__API__}/manga/cover/${guid}`
          }))
        this.searching = false
      },
      updateAction() {
        if (this.search.length < 1) {
          this.matches = []
        }
        if (this.timer) clearTimeout(this.timer)
        this.searching = true
        this.timer = setTimeout(this.searchManga, 500)
      },
      async goRandom() {
        const url = `${__API__}/random/`
        const { data: { error, results } } = await axios.get(url)
        if (!results) return
        document.location.href = `/${results}`
      }
    },
    mounted() {
      this.$nextTick(() => {
        this.$refs.searchInput.focus()
      })
    }
  }
</script>
<style lang="stylus" scoped>
  .search
    display flex
    justify-content center
    align-items center
    flex-direction column
    height 100vh
  .header
    display flex
    justify-content center
    align-items center
    text-align center
    width 90%
    margin 20px
    height 200px
    font-size: 50px
    font-weight bold
    img
      width 100%
      height 100%
      object-fit contain
    &:before
      content ''
      position absolute
      top 0
      left 0
      right 0
      bottom 0
      background-image url('/full.jpg')
      background-size cover
      background-position 80% 50%
      z-index -1
      opacity 0.1
      border-radius 10px
  .inputZone
    position relative
    width: 60%
    span
      position absolute
      left 10px
      top 50%
      transform translateY(-50%)
      color rgba(255,255,255,0.3)
  input
    width: 100%
    font-size 20px
    padding: 10px 80px 10px 40px
    text-align left
    outline none
    font-weight bold
    border 1px solid rgba(255, 255, 255, 0.3)
    background-color transparent
    border-radius: 20px
    color var(--foreground)
  .matches
    padding-top: 20px
    width 60%
    max-height 50vh
    overflow-y auto
    scrollbar-color var(--primary) var(--background)
    scrollbar-width thin
    img
      width 50px
      height 50px
      object-fit cover
  .match
    display flex
    align-items center
    padding: 10px
    border-radius 5px
    &:hover
      background-color var(--primary)
    img
      margin-right 10px
  .randomBtn
    padding: 10px
    border-radius 5px
    margin-top 20px
    background-color var(--primary)
    color var(--foreground)
    cursor pointer
  @media (max-width: 600px)
    .inputZone, .matches
      width 90%
</style>
