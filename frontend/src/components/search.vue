<template lang="pug">
  .search
    .header Manga Café
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
      //- .btn Search
    .noMatches(v-if="!matches.length && search.length > 3 && !searching") No matches found >.<
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
            image: `https://temp.compsci88.com/cover/${guid}.jpg`
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
    position relative
    display flex
    justify-content center
    align-items center
    text-align center
    width 90%
    margin 20px
    height 200px
    font-size: 50px
    font-weight bold
    &:before
      content ''
      position absolute
      top 0
      left 0
      right 0
      bottom 0
      background-image url('/header.png')
      background-size cover
      background-position center
      z-index -1
      opacity 0.5
      border-radius 10px
  .inputZone
    position relative
    width: 60%
    span
      position absolute
      left 10px
      top 50%
      transform translateY(-50%)
      color rgba(255,255,255,0.1)
  input
    width: 100%
    font-size 20px
    padding: 10px 80px 10px 40px
    text-align left
    outline none
    font-weight bold
    border 1px solid rgba(255, 255, 255, 0.1)
    background-color transparent
    border-radius: 20px
    &::placeholder, &
      color var(--foreground)
    &::placeholder
      opacity 0.5
      font-weight normal
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
  @media (max-width: 600px)
    .inputZone, .matches
      width 90%
</style>
