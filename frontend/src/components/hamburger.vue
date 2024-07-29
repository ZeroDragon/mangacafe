<template lang="pug">
  .menu(:class="{displaying: displaying}")
    .icon: span.material-symbols-outlined(@click="toggleMenu") {{menuIcon}}
    .title My Lists
    .lists
      .list(v-for="(list, key) in lists" :key="key")
        .name {{list.display}}
        .manga(v-for="(manga, mkey) in list.items" :key="mkey")
          .manga: a(:href="'/' + manga") {{manga}}
</template>
<script>
export default {
  data() {
    return {
      displaying: false,
      menuIcon: 'menu',
      lists: {}
    }
  },
  methods: {
    toggleMenu() {
      this.displaying = !this.displaying
      this.menuIcon = this.displaying ? 'close' : 'menu'
      this.reloadData()
    },
    reloadData() {
      this.lists = this.$storage.get('lists')
    }
  }
}
</script>
<style lang="stylus">
.menu
  position: fixed
  top: 0
  right: -300px
  width: 300px
  height: 100%
  background-color: var(--background)
  padding: 10px
  z-index: 100
  transition: right 0.5s
  &.displaying
    border-left: 1px solid var(--primary)
    box-shadow: 0 0 10px #000
    right: 0
  .title
    font-size: 2em
    font-weight: 400
  .icon
    position absolute
    left: -35px
    cursor pointer
.list .name
  font-size: 1.5em
  font-weight: 400
@media (max-width: 600px)
  .menu
    width: 100%
    right: -100%
    &.displaying
      right: 0
      .icon
        left: 93%
</style>
