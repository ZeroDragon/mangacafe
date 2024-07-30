<template lang="pug">
.holder(v-if="displaySettings")
  .floating
    .boddy
      .section
        .title Last chapter read
        input(type="number" v-model="manga.lastRead")
        .title Feature in:
        .options
          .option(
            v-for="(item, key) in lists",
            v-bind:key="key"
            :class="{ active: item.items.includes(mangaLoaded) }"
            @click="toggleMangeInList(key)"
          ) {{ item.display }}
    .footer
      .buttons
        a.close(@click="close") Close
        a(@click="save") Save
</template>

<script>
export default {
  data: _ => ({
    mangaLoaded: null
  }),
  computed: {
    displaySettings () {
      const mangaLoaded = this.$storage.get('mangaLoaded')
      this.mangaLoaded = mangaLoaded
      const manga = this.$storage.get('mangas')[mangaLoaded] || {
        lastRead: 0
      }
      const lists = this.$storage.get('lists')
      this.lists = lists
      this.manga = manga
      return this.$storage.get('displaySettings')
    }
  },
  methods: {
    close () {
      this.$storage.set('displaySettings', false)
    },
    save () {
      this.$storage.set('displaySettings', false)
      const mangas = this.$storage.get('mangas')
      mangas[this.mangaLoaded] = this.manga
      this.$storage.set('mangas', mangas)
    },
    toggleMangeInList (key) {
      const list = this.lists[key]
      if (list.items.includes(this.mangaLoaded)) {
        list.items = list.items.filter(item => item !== this.mangaLoaded)
      } else {
        list.items.push(this.mangaLoaded)
      }
      this.lists[key] = list
      this.$storage.set('lists', this.lists)
    }
  },
  beforeMount () {
    
  }
}
</script>

<style lang="stylus" scoped>
.holder
  position fixed
  top 0
  left 0
  width 100%
  height 100%
  background rgba(0, 0, 0, 0.5)
  display flex
  justify-content center
  align-items center
  z-index 100
.floating
  background white
  border-radius 5px
  padding 20px
  box-shadow 0 0 10px rgba(0, 0, 0, 0.5)
.boddy
  margin-bottom 20px
  min-width 300px
  color: var(--background)
.footer
  display flex
  justify-content flex-end
.buttons
  a
    cursor pointer
    margin-left 10px
    background-color var(--primary)
    padding 10px 20px
    border-radius 5px
    &.close
      background-color tomato
input
  width 100%
  padding 10px
  margin-bottom 10px
.section .options
  display: flex
.option
  padding 10px
  cursor pointer
  border-radius 5px
  &.active
    background-color var(--primary)
    color var(--foreground)
@media (max-width 600px)
  .section .options
    flex-direction column
</style>
