// Smoke test para Épica 1: modelo de datos.
// Correr desde backend/: node tests/smoke-data-model.mjs
import '../../dotenv.mjs'
import db, { ready } from '../src/models/db.mjs'
import user from '../src/models/user.mjs'
import series from '../src/models/series.mjs'
import seriesItem from '../src/models/series_item.mjs'

await ready // garantiza que el schema está creado antes de queryar

const log = (...a) => console.log('•', ...a)
const fail = (...a) => { console.error('✗', ...a); process.exitCode = 1 }

const username = `tester_${Date.now()}`
log(`Creando usuario ${username}`)
const signupRes = await user.signup(username, 'pass123')
if (signupRes.error) fail('signup:', signupRes.error)
const { data: u } = await user.getBy('username', username)
if (!u) fail('getBy usuario: no encontrado')
log(`Usuario creado con id=${u.id}`)

log('Creando serie manga')
const seriesRes = await series.create(u.id, {
  type: 'manga',
  name: 'One Punch Man',
  url: 'https://manga.example.com/opm',
  cover_url: 'https://cdn.example.com/opm.jpg',
  current_chapter: 100,
  imdb_url: 'https://www.imdb.com/title/tt0000001/episodes/?season=1'
})
if (seriesRes.error || !seriesRes.id) fail('create serie:', seriesRes.error)
const seriesId = seriesRes.id
log(`Serie creada id=${seriesId}`)

log('Insertando 3 items (uno duplicado)')
const items = [
  { guid: 'g1', title: 'Cap 101', link: '/101', pub_date: 1700000000 },
  { guid: 'g2', title: 'Cap 102', link: '/102', pub_date: 1700001000 },
  { guid: 'g3', title: 'Cap 103', link: '/103', pub_date: 1700002000 }
]
const ins1 = await seriesItem.insertMany(seriesId, items)
log(`Insertados: ${ins1.inserted}`)
if (ins1.inserted !== 3) fail('esperaba 3 insertados')

log('Insertando items con un duplicado y uno nuevo')
const items2 = [
  { guid: 'g2', title: 'Cap 102 dup', link: '/102', pub_date: 1700001000 },
  { guid: 'g4', title: 'Cap 104', link: '/104', pub_date: 1700003000 }
]
const ins2 = await seriesItem.insertMany(seriesId, items2)
log(`Insertados (2da vez): ${ins2.inserted}`)
if (ins2.inserted !== 1) fail('esperaba 1 nuevo en 2da inserción (dedupe g2)')

log('Contando pendientes (debería ser 4)')
const pend = await seriesItem.pendingCount(seriesId)
log(`Pendientes: ${pend.data}`)
if (pend.data !== 4) fail('esperaba 4 pendientes')

log('pendingByUser')
const pendUser = await seriesItem.pendingByUser(u.id)
if (pendUser.error) fail('pendingByUser:', pendUser.error)
const row = pendUser.data.find(r => r.series_id === seriesId)
log(`Dashboard serie=${row.name} pending=${row.pending}`)
if (!row || row.pending !== 4) fail('pendingByUser mal')

log('listBySeries (solo pendientes)')
const list = await seriesItem.listBySeries(seriesId, { onlyPending: true })
log(`Items pendientes listados: ${list.data.length}`)

log('markSeenUpTo: marcar hasta g2 (inclusive)')
const g2 = list.data.find(i => i.guid === 'g2')
const markRes = await seriesItem.markSeenUpTo(seriesId, g2.id)
log(`Marcados: ${markRes.updated}`)
if (markRes.updated !== 2) fail('esperaba 2 marcados (g1 y g2)')

log('Conteo tras marcar (debería ser 2)')
const pend2 = await seriesItem.pendingCount(seriesId)
log(`Pendientes: ${pend2.data}`)
if (pend2.data !== 2) fail('esperaba 2 pendientes tras markSeenUpTo')

log('Ownership: getById con otro userId no debería encontrar la serie')
const other = await series.getById(seriesId, u.id + 9999)
if (other.data) fail('ownership falló: otro usuario ve la serie')
log('Ownership OK (otro usuario no la ve)')

log('Update serie: cambiar current_chapter y imdb_url')
const upd = await series.update(seriesId, u.id, { current_chapter: 102, imdb_url: 'https://www.imdb.com/title/tt0000002/episodes/?season=1' })
if (upd.error) fail('update:', upd.error)
const { data: updated } = await series.getById(seriesId, u.id)
log(`Tras update: current_chapter=${updated.current_chapter} imdb_url=${updated.imdb_url}`)
if (updated.current_chapter !== 102 || updated.imdb_url !== 'https://www.imdb.com/title/tt0000002/episodes/?season=1') fail('update no aplicado')

log('Remove serie: borra en cascada los items')
const del = await series.remove(seriesId, u.id)
if (del.error) fail('remove:', del.error)
const afterDel = await seriesItem.pendingCount(seriesId)
log(`Pendientes tras borrar serie: ${afterDel.data}`)
if (afterDel.data !== 0) fail('CASCADE no funcionó (debería ser 0)')

log('listByUser al final (0 series)')
const all = await series.listByUser(u.id)
if (all.data.length !== 0) fail('esperaba 0 series tras borrar')

log('=== Smoke test OK ===')
db.close()
