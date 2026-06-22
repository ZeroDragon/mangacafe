<template lang="pug">
.series-list
  header.bar
    h1 Your series
    button.add(@click="$router.push('/series/new')")
      span.material-symbols-outlined add
      span New
  Loader(v-if="loading" skeleton)
  .empty(v-else-if="!series.length")
    span.material-symbols-outlined library_books
    p You don't have any series yet, add one.
    button.add(@click="$router.push('/series/new')")
      span.material-symbols-outlined add
      span Create series
  .grid(v-else)
    SeriesCard(
      v-for="s in series"
      :key="s.id"
      :series="s")
</template>

<script>
import api from '../api.js'
import SeriesCard from './SeriesCard.vue'
import Loader from './Loader.vue'

export default {
  name: 'SeriesList',
  components: { SeriesCard, Loader },
  data () {
    return {
      series: [],
      loading: false,
      error: ''
    }
  },
  mounted () {
    this.fetch()
  },
  methods: {
    async fetch () {
      this.loading = true
      this.error = ''
      try {
        const res = await api.get('/api/series')
        this.series = res.data.data || []
      } catch (e) {
        this.error = 'Could not load your series'
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style lang="stylus" scoped>
.series-list
  margin-top 16px
.bar
  display flex
  align-items center
  justify-content space-between
  gap 12px
  margin-bottom 16px
  h1
    font-weight 300
    margin 0
.add
  display inline-flex
  align-items center
  gap 4px
  background var(--primary)
  border none
  color #fff
  padding 8px 12px
  border-radius 6px
  cursor pointer
  font-size 14px
  &:hover
    opacity 0.9
  .material-symbols-outlined
    font-size 18px
.grid
  display grid
  grid-template-columns repeat(auto-fill, minmax(320px, 1fr))
  gap 12px
.loading, .empty
  text-align center
  opacity 0.7
  padding 40px 0
.empty
  display flex
  flex-direction column
  align-items center
  gap 12px
  .material-symbols-outlined
    font-size 48px
    opacity 0.4
  p
    margin 0
.error
  color var(--danger)
  text-align center
</style>
