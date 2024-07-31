<template lang="pug">
  .menu(:class="{displaying: displaying}")
    .icon: span.material-symbols-outlined(@click="toggleMenu") {{menuIcon}}
    a(href="/").section
      span.icn.material-symbols-outlined home
      | Go Home
    .section
      span.icn.material-symbols-outlined list
      | My manga lists
    .lists
      .list(v-for="(list, key) in lists" :key="key")
        .name(@click="toggleList(list)")
          | {{list.display}} 
          span.count ({{list.items.length}})
        TransitionGroup(tag="div", name="mangaList")
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
</template>
<script>
import axios from 'axios'
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
      this.reloadData()
    },
    reloadData() {
      const lists = this.$storage.get('lists')
      //cleanLists
      for(const key in lists) {
        delete lists[key].show
        delete lists[key].itemsParsed
      }
      this.$storage.set('lists', lists)
      this.lists = JSON.parse(JSON.stringify(lists))
      this.mangas = this.$storage.get('mangas')
    }
  }
}
</script>
<style lang="stylus" scoped>
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
  &.displaying
    border-left 1px solid var(--primary)
    box-shadow 0 0 10px #000
    right 0
  .icon
    position absolute
    left -35px
    cursor pointer
.list .name
  font-size 1.2em
  font-weight 400
  margin-left var(--offset)
  .count
    font-size 0.8em
    opacity 0.5
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

@media (max-width 600px)
  .menu
    width 100%
    right -100%
    &.displaying
      right 0
      .icon
        left 90%
  .list .manga
    .data .title
      max-width 280px
</style>
