<script>
import axios from 'axios'

const titles = [
  'Kaiju No. 8',
  'My Hero Academia',
  'Shinmai Ossan Bouken',
  'Jujutsu Kaisen',
  'The Gamer',
  'Demon Slayer',
  'Uzaki-chan Wants to Hang Out!',
]

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
        return this.placeholder()
      }
      if (this.timer) clearTimeout(this.timer)
      this.searching = true
      this.timer = setTimeout(this.searchManga, 500)
    },
    placeholder (prevSelected, index = 1) {
      if (this.placeTimer) clearTimeout(this.placeTimer)
      if (this.search.length < 1) {
        if (!prevSelected) {
          const selected = titles[Math.floor(Math.random() * titles.length)]
          return this.placeholder(selected)
        }
        if (index > prevSelected.length + 12) return this.placeholder()
        this.placeH = prevSelected.slice(0, index)
        this.placeTimer = setTimeout(() => {
          this.placeholder(prevSelected, index + 1)
        }, 150)
      }
    }
  },
  mounted() {
    this.placeholder()
    this.$nextTick(() => {
      this.$refs.searchInput.focus()
    })
  }
}
</script>
<template lang="pug">
  .search
    .header Monas Chinas
    input(
      type="text",
      v-model="search",
      :placeholder="placeH",
      @keyup.enter="searchManga",
      @keyup="updateAction"
      ref="searchInput"
    )
    .noMatches(v-if="!matches.length && search.length > 3 && !searching") No matches found >.<
    .matches
      a.match(
        v-for="match in matches", v-bind:key="match.guid"
        :href="match.guid"
      )
        img(:src="match.image")
        .itemTitle {{ match.title }}
</template>
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
input
  width 60%
  border-radius 5px
  border none
  font-size 20px
  padding: 10px
  text-align center
  outline none
  background-color transparent
  font-weight bold
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
  .input, .matches
    width 90%
</style>
