<template lang="pug">
  .menuIcons
    .icon: span.material-symbols-outlined(@click="toggleMenu") {{menuIcon}}
    .icon.refresh: span.material-symbols-outlined(@click="refresh" v-if="displaying") refresh
  .menu(:class="{displaying: displaying}")
    a(href="/").section
      span.icn.material-symbols-outlined home
      | Go Home
    .section
      span.icn.material-symbols-outlined list
      | My manga lists
    .lists
      .indicators: .indicator(v-for="(list, key) in lists" :key="key", :class="{active: list.active}")
      .list(v-for="(list, key) in lists" :key="key")
        template(v-if="list.active")
          .name
            span.material-symbols-outlined.listNav(@click="moveList('prev')") arrow_back
            span(@click="toggleList(list)")
              |{{list.display}} 
              span.count  ({{list.items.length}})
            span.material-symbols-outlined.listNav(@click="moveList('next')") arrow_forward
          TransitionGroup(tag="div", name="mangaList").mangaList
          .mangaList
            a.manga(
              v-for="manga in list.itemsParsed"
              :key="manga.uri"
              :href="'/' + manga.uri"
              v-if="list.show"
            )
              .img(v-if="manga.image")
                object(:src="manga.image")
                  img(:src="'https://temp.compsci88.com/cover/' + manga.uri + '.jpg'")
              .data
                span.new(v-if="manga.newChapters > 0") {{manga.newChapters}} unread!
                span.title {{manga.title}}
    user
</template>
<script>
import axios from 'axios'
import user from './user.vue'
export default {
  data() {
    return {
      displaying: false,
      menuIcon: 'menu',
      lists: {}
    }
  },
  methods: {
    async listSeries (result, [current, ...rest]) {
      if(!current) return result.sort((a, b) => b.newChapters - a.newChapters)
      const { data: { data } } = await axios.get(`${__API__}/manga/${current}`)
      const { lastRead } = this.mangas[current] || { lastRead: 0 }
      const lastChapter = data.chapters[0]
      const newChapters = Math.max(0, lastChapter.index - lastRead)
      result.push({
        newChapters,
        title: data.title,
        image: data.image,
        uri: current
      })
      this.listSeries(result, rest)
    },
    moveList (direction) {
      const current = Object.entries(this.lists).find(([key, { active }]) => active)
      const currentIndex = this.listsNames.indexOf(current[0])
      const thisList = this.lists[current[0]]
      let nextIndex = (currentIndex + 1) % this.listsNames.length
      if (direction === 'prev') {
        nextIndex = (currentIndex - 1 + this.listsNames.length) % this.listsNames.length
      }
      const nextList = this.lists[this.listsNames[nextIndex]]
      thisList.active = false
      thisList.show = true
      this.toggleList(thisList)
      nextList.active = true
      thisList.show = false
      this.toggleList(nextList)
    },
    updateList(list) {
      list.itemsParsed = []
      this.listSeries(list.itemsParsed, list.items)
    },
    toggleList(list) {
      list.show = !list.show
      if(list.show) this.updateList(list)
    },
    toggleMenu() {
      this.displaying = !this.displaying
      this.menuIcon = this.displaying ? 'close' : 'menu'
      document.getElementsByTagName('body')[0].style.overflow = this.displaying ? 'hidden' : 'auto'
      if(this.displaying) this.reloadData()
    },
    reloadData() {
      const lists = this.$storage.get('lists')
      this.listsNames = Object.keys(lists)
      //cleanLists
      for(const key in lists) {
        delete lists[key].show
        delete lists[key].itemsParsed
      }
      this.lists = JSON.parse(JSON.stringify(lists))
      this.lists.reading.active = true
      this.lists.reading.show = false
      this.toggleList(this.lists.reading)
      this.mangas = this.$storage.get('mangas')
    },
    async refresh() {
      document.location.reload()
    }
  },
  components: {
    user
  }
}
</script>
<style lang="stylus" scoped>
.menuIcons
  position fixed
  top 15px
  right 5px
  z-index 101
  .icon
    position absolute
    left -35px
    cursor pointer
    &.refresh
      left -65px
.menu
  --offset 10px
  position fixed
  top 0
  right -300px
  width 300px
  height 100%
  background-color var(--background)
  padding 10px
  z-index 100
  transition right 0.5s
  display flex
  flex-direction column
  overflow-y auto
  scrollbar-color var(--primary) var(--background)
  scrollbar-width thin
  &.displaying
    border-left 1px solid var(--primary)
    box-shadow 0 0 10px #000
    right 0
.lists
  flex-grow 1
.list .name
  font-size 1.2em
  font-weight 400
  text-align center
  display flex
  justify-content space-between
  align-items center
  margin-bottom 10px
  .count
    font-size 0.8em
    opacity 0.5
  .listNav
    cursor pointer
    margin 0 5px
    font-size 0.8em
    color var(--primary)
.indicators
  display flex
  .indicator
    flex-grow 1
    height 5px
    background-color var(--primary)
    margin 5px 0
    opacity 0.5
    &.active
      opacity 1
.list .manga
  margin-left calc(var(--offset) * 2)
  display flex
  align-items center
  .img
    width 50px
    margin-right 10px
    img
      width 50px
      height 50px
      border-radius 5px
      object-fit cover
  .data
    display flex
    flex-direction column
  .data .new
    font-size 0.8em
    color var(--primary)
    font-weight 500
  .data .title
    max-width 180px
    white-space nowrap
    overflow hidden
    text-overflow ellipsis
.section
  display flex
  align-items center
  font-size 20px
  .icn
    margin-right 10px

.mangaList-move, .mangaList-enter-active, .mangaList-leave-active
  transition all 0.5s ease
.mangaList-enter-from, .mangaList-leave-to
  opacity 0
  transform translateX(30px)
.mangaList-leave-active
  position absolute

.mangaList
  overflow-y auto
  scrollbar-color var(--primary) var(--background)
  scrollbar-width thin
@media (max-width 600px)
  .menu
    width 100%
    right -100%
    padding-bottom 25px
    &.displaying
      right 0
      .icon
        left 90%
        &.refresh
          top 40px
  .list .manga
    .data .title
      max-width 280px
</style>
