# Manga Café — Contexto para agentes IA

> **Lee este archivo primero.** Es el punto de entrada para retomar el desarrollo en cualquier sesión. Después continúa con `PROJECT.md`, `ARCHITECTURE.md` y el estado de las épicas en `epics/`.

---

## Qué es el proyecto

Tracker personal de lectura de mangas y episodios de anime vistos. Reemplazo completo del proyecto anterior (que era un cliente de MangaDex con bot de Telegram). **Solo se conserva el scaffolding técnico.**

### Flujo de usuario objetivo

1. El usuario hace login.
2. Da de alta una serie: nombre, URL donde la lee/ve, portada (URL externa), capítulo actual, y opcionalmente una URL de IMDB (`…/title/tt…/episodes/?season=N`).
3. Cada vez que entra al dashboard, el sistema refresca desde IMDB y le muestra:
   - Qué series tienen actualizaciones.
   - Cuántos episodios/capítulos le faltan por ver (conteo de items nuevos no vistos).
   - Errores visibles para que pueda corregirlos (URL inválida, ttId inexistente, etc.).

---

## Decisiones de producto (del usuario — NO cambiar sin consultar)

| # | Decisión | Valor |
|---|----------|-------|
| 1 | Hashing de password | **`bcrypt`** (cost factor 10; migración de `md5` completada en Épica 2) |
| 2 | Usuarios | **Multiusuario real** (filtrar siempre por `user_id`, índices estrictos) |
| 3 | Portada | **Solo URL externa** (no subir archivos, no usar `multer`, no carpeta de imágenes) |
| 4 | Detección de nº de capítulo | **Conteo de items nuevos (ya emitidos/publicados) del feed** desde el último visto — IMDB para anime, RSS para manga (Épica 9). Si no funciona, se itera |
| 5 | Cron de refresco IMDB | **Cada 6h en producción** + **trigger on-demand para desarrollo** |
| 6 | Manga vs anime | **Entries independientes** con campo `type` (una serie no agrupa ambos) |
| 7 | Fallos de IMDB | **Error visible** en el dashboard para que el usuario lo corrija |
| 8 | Feed según `type` | **anime → URL de IMDB** (`imdb_url`); **manga → URL de RSS/Atom** (`rss_url`). Un campo u otro, nunca ambos (Épica 9) |
| 9 | Indicador de progreso | El "último leído/visto" es el **`title` del último item visto** guardado en `series.last_read` (**string, nullable**), no un número de capítulo manual. Se recalcula solo al marcar items visto/no-visto. `NULL` ⇒ se muestra como **"No data"**. `series.current_chapter` se elimina por completo (dato zombie) (Épica 10) |
| 10 | Reels como tabla aparte | Los reels de FB se guardan en `reels` (no en `series`). Marcar visto es **por-item sin cascada**. Funciona como watch-later / ToDo: pendientes arriba, vistos en sección separada. El dashboard muestra un único card con thumbnail fijo (Épica 11) |
| 11 | `rss_url` acepta RSS **o** HTML | El campo `series.rss_url` de un manga admite (a) un feed RSS/Atom o (b) la URL de la página de la serie en un sitio soportado (comivex.com al iniciar). El refresher detecta el tipo automáticamente y rutea al parser o al scraper del proveedor. **No** se agrega una columna nueva: la detección es por contenido/host, no por un flag en la DB (Épica 12) |
| 12 | Etiquetas de `type` en la UI | La UI muestra **"Show"** para `type='anime'` y **"Graphic novel"** para `type='manga'`. Los valores internos de `series.type` (`'anime'`, `'manga'`) **no cambian** — son ids estables usados en queries, dispatch de feeds y clases CSS. El rename es exclusivamente cosmético (Épica 13) |

---

## Stack conservado (no reemplazar)

- **Backend:** Node.js (ESM, `.mjs`) + Express 4 + SQLite3 (driver `sqlite3` con callbacks) + Pug (registrado como view engine) + JWT custom (`backend/src/auth.mjs`).
- **Frontend:** Vue 3 (build runtime+compiler) + Vue Router 4 + Vite 5 + Stylus + Pug (en `<template lang="pug">` de los SFCs). Sin Vuex/Pinia.
- **Infra:** PM2 (`backend/ecosystem.config.cjs`) + GitHub Actions (`.github/workflows/deploy.yml`, manual `workflow_dispatch`).
- **Env:** loader custom en `dotenv.mjs` (formato `KEY value` con **un solo espacio** como separador).

### Qué se eliminó en la Épica 0
`bot.mjs`, `search.mjs`, `fetcher.mjs`, `scrapper.mjs`, `models/settings.mjs`, carpeta `mangas/`, y los componentes Vue `chapter`, `manga`, `search`, `settings`, `hamburger`, `user`, `tooltip`.

---

## Reglas de trabajo para agentes

1. **Leer antes de editar.** Usar `view` en cualquier archivo antes de modificarlo; respetar indentación exacta (Stylus es sensible al sangrado).
2. **ESM obligatorio** en backend: extensión `.mjs`, imports con rutas relativas con extensión incluida.
3. **Rutas del backend:** todas bajo prefijo `/api/`. Las protegidas usan el middleware `[verifyToken, getUser]` exportado desde `backend/src/index.mjs`.
4. **Frontend → backend:** la URL base se inyecta con `define` de Vite como `__API__` (ver `frontend/vite.config.js`). Usar `${__API__}/...`. Token JWT va en `localStorage.token` y header `Authorization: Bearer <token>`.
5. **DB:** driver `sqlite3` con callbacks envueltas en `Promise`. Las tablas se crean con `createTable()` de `backend/src/models/db.mjs` al importar el módulo.
6. **Estilos:** Stylus con variables CSS definidas en `frontend/src/styles.styl` (`--background`, `--foreground`, `--primary`, `--danger`). Iconos Material Symbols ya cargados en `index.html`.
7. **Multiusuario:** toda query a `series`/`series_items` DEBE filtrar por `user_id` (vía JOIN con `series` o validando ownership). No exponer nunca datos de otro usuario.
8. **No reintroducir:** Telegram, MangaDex, subida de archivos, `multer`, `__BOT_NAME__`, ni la tabla `user_data`.
9. **Testear después de cada cambio:** backend `npm start` desde `backend/`; frontend `npm run build` o `npm run dev` desde `frontend/`. Hay un `.env` temporal en el root (gitignored) para dev local.
10. **Commits:** solo cuando el usuario lo pida explícitamente.
11. **Atribuciones en commits:** **NUNCA** agregar líneas de atribución tipo `💘 Generated with Crush`, `Assisted-by: ... via Crush <crush@charm.land>`, ni ninguna firma/co-authored-by de la herramienta o del modelo. El mensaje debe contener solo el subject + body del cambio. Si se reescribe historial, omitir las atribuciones existentes.
12. **Idioma:** comunicación con el usuario en **español mexicano** (tú, no vos). Sin voseo en conjugación ni acentos (p. ej. "lee", "mira", "prueba"; no "leé", "mirá", "probá"). Los comentarios y strings de código pueden ir en español neutro o en inglés según el archivo.
13. **Mantener la documentación al día:** cada cambio de código (nueva tabla, nuevo endpoint, nuevo modelo, nuevo componente, nuevo env var, cambio en middleware) DEBE actualizar **en el mismo cambio**:
    - `docs/AGENTS.md` → sección *Mapa rápido de archivos* (si se agrega/quita un archivo) y *Decisiones de producto* (si hay una decisión nueva).
    - `docs/ARCHITECTURE.md` → secciones *Rutas*, *Schema de DB*, *Mapa de módulos* y *Env vars* según lo que se toque.
    - `docs/PROJECT.md` → tabla de *Épicas* (estado) y *Decisiones* (si aplica).
    - `env_example` → variables nuevas, con una línea por var en el formato `KEY "descripción"`.
    
    No esperar al final de la épica: la doc debe quedar correcta **después de cada paso**, porque la próxima sesión de un agente va a leerla para arrancar y se ahorra volver a descubrir lo que ya está escrito.

---

## Cómo correr el proyecto (dev)

```bash
# 1. .env en el root (formato KEY value separado por UN espacio)
#    PORT 3000
#    DB_PATH ./dev.sqlite
#    API http://localhost:3000
#    SECRET <cualquier-string>

# 2. Backend
cd backend && npm install && npm start

# 3. Frontend (otra terminal)
cd frontend && npm install && API=http://localhost:3000 npm run dev
```

> El `.env` del root **no se commitea** (`.gitignore` tiene `*.env`). Para el build de producción, `vite.config.js` lee `env.API` y `env.BUILD_OUT_DIR`.

---

## Mapa rápido de archivos

> **Mantener al día** (regla 13). Estructura actual (post-Épica 11).

```
backend/
  package.json                 # type:module; deps: axios, bcrypt, cheerio, express, pug, sqlite3, xml2js
  ecosystem.config.cjs          # PM2: app "mangacafe", cron_restart diario
  src/
    index.mjs                  # Express app + rutas + middlewares verifyToken/getUser/resolveUserId (exportados)
    auth.mjs                   # JWT custom (HMAC-SHA256, expira 1 año)
    refresher.mjs              # Scheduler de feeds (6h) + refreshSeries/refreshAll/refreshByUser (dispatch por type; manga vía sources.fetchItems)
    imdb.mjs                   # Scraper de IMDB vía GraphQL interno → items [{guid,title,link,pub_date}]
    rss.mjs                    # Parser RSS 2.0 / Atom → items (xml2js)
    crunchyroll.mjs            # Sync externo on-demand (watchlist + resolver ttId)
    reel_fetch.mjs             # Detección best-effort del título de un reel (og:title regex, fallback null)
    sources/                   # Épica 12: orquestador de fuentes para mangas
      index.mjs                # fetchItems(url) + detectSource (host routing + sniff de body)
      rss.mjs                  # Adapter RSS (wrapper sobre src/rss.mjs)
      comivex.mjs              # Adapter de comivex.com (cheerio; hace su propio GET con UA de browser)
    models/
      db.mjs                   # conexión SQLite + createTable/createIndex/addColumnIfMissing/dropColumnIfExists + migraciones
      user.mjs                 # signup/login/getBy/update (bcrypt cost 10)
      series.mjs               # CRUD series (ALLOWED_FIELDS, ownership por user_id)
      series_item.mjs          # feed items: insertMany (OR IGNORE), markSeen/markUnseen (CASCADA), markAllSeen, recomputeLastRead, dashboardByUser
      reel.mjs                 # CRUD reels (watch-later): sin cascada, sin last_read, pendingCountByUser
  tests/                       # smoke tests (uno por épica); cada uno levanta su propio server en puerto efímero
    smoke-auth.mjs             # Épica 2
    smoke-data-model.mjs       # Épica 1
    smoke-series-crud.mjs      # Épica 3
    smoke-imdb-engine.mjs      # Épica 4
    smoke-dashboard.mjs        # Épica 5 (incluye reelsPending desde Épica 11)
    smoke-series-detail.mjs    # Épica 6
    smoke-rss-engine.mjs       # Épica 9 (incluye dispatch manga→comivex desde Épica 12)
    smoke-sources.mjs          # Épica 12 (detectSource + adapters RSS/comivex)
    smoke-reels.mjs            # Épica 11
    fixtures/comivex-1295.html # Épica 12: snapshot HTML para tests offline

frontend/
  index.html                   # entry HTML, carga styles.styl + fonts, monta #app
  vite.config.js               # plugin vue + dotPathFixPlugin + define __API__
  src/
    main.js                    # createApp(App) + router + plugins $storage / $toast + registro onUnauthorized
    router.js                  # rutas: /login /dashboard /series /series/new /series/:id /series/:id/edit /crunchyroll /reels + guard auth
    api.js                     # axios con __API__, Authorization, rotación de token, handler 401
    App.vue                    # root: AppHeader (si autenticado) + router-view + Toasts
    storage.js                 # plugin $storage (reactive simple, sin persistencia)
    toast.js                   # plugin $toast + manager {info, success, error, dismiss}
    styles.styl                # variables CSS globales (--background --foreground --primary --danger)
    components/
      Login.vue                # form toggle login/signup (Épica 2)
      AppHeader.vue            # nav: Dashboard / Series / Reels + botón "New" + menú de usuario (dropdown con Sync Crunchyroll + Logout) (Épica 2, reorganizado en 13)
      Loader.vue               # spinner + esqueleto reutilizable
      Toasts.vue               # contenedor de toasts (consume toast.js)
      Dashboard.vue            # grid de SeriesCard + filtros + refresh + card sintético de Reels (Épica 5, extendido en 11)
      SeriesCard.vue           # card reutilizable: props {series, to?}; badges anime/manga/reel (Épica 5, extendido en 11)
      SeriesList.vue           # listado CRUD de series
      SeriesForm.vue           # alta/edición (dispatch imdb_url/rss_url por type)
      SeriesDetail.vue         # detalle + feed + cascada seen/unsee
      Crunchyroll.vue          # sync externo on-demand
      Reels.vue                # ToDo watch-later: To watch / Watched + form + edit inline + toggle seen (Épica 11)
      home.vue                 # placeholder sin uso (legacy Épica 0)
  public/
    reel-thumb.png             # thumbnail fijo del card y los items de Reels (Épica 11)

dotenv.mjs                     # loader custom: formato "KEY value" separado por UN espacio
env_example                    # documenta vars: PORT DB_PATH API SECRET IMDB_* RSS_* REEL_* BUILD_OUT_DIR

docs/
  AGENTS.md                    # ESTE ARCHIVO (contexto + reglas)
  PROJECT.md                   # visión, decisiones de producto, tabla de épicas
  ARCHITECTURE.md              # detalle técnico: schema DB, rutas, módulos, env
  epics/
    00-cleanup.md ... 12-source-autodetect.md
```

---

## Patrones del código

Para no tener que leer todo el código cada vez. Estos son los molds que ya funcionan; una feature nueva debe seguirlos.

### Modelo nuevo (`backend/src/models/<name>.mjs`)

```js
import db from './db.mjs'

const ALLOWED_FIELDS = ['url', 'title']  // whitelist para update

const create = (userId, { url, title }) => {
  return new Promise(resolve => {
    db.run(
      `INSERT OR IGNORE INTO <table> (user_id, url, title) VALUES (?, ?, ?)`,
      [userId, url, title ?? null],
      function (err) {                         // function () para tener this.lastID/this.changes
        if (err) return resolve({ error: err })
        if (this.changes === 0) return resolve({ skipped: true })  // UNIQUE violado
        resolve({ success: true, id: this.lastID })
      }
    )
  })
}

// listByUser/update/remove: SIEMPRE WHERE id = ? AND user_id = ? (ownership)
```

- Devuelve objetos `{success|error|skipped|data}`, nunca lanza.
- Ownership en todas las mutaciones: `WHERE id = ? AND user_id = ?`. Si `this.changes === 0`, resolver con `{ error: 'X not found or not owned' }`.
- Para update: armar `setClauses` iterando `ALLOWED_FIELDS`, agregar `updated_at = strftime('%s','now')`.

### Ruta protegida nueva (`backend/src/index.mjs`)

```js
app.post('/api/endpoint', [verifyToken, getUser, resolveUserId], async (req, res) => {
  // res.userId  → filtrar SIEMPRE por este user_id
  // res.newToken → incluir en el body de respuesta (rotación de token)
  const result = await model.method(res.userId, ...)
  if (result.error) return res.status(500).json({ error: result.error })
  res.json({ ...result, token: res.newToken })
})
```

- Tres middlewares en cadena: `verifyToken` (firma), `getUser` (deja `res.username`), `resolveUserId` (deja `res.userId`).
- Validar body con un helper `validateX(body, partial=false)` que devuelva array de mensajes; si tiene length, `400`.
- Status: `400` validación, `404` not found / not owned, `500` error de DB.

### Smoke test (`backend/tests/smoke-<feature>.mjs`)

```js
import '../../dotenv.mjs'
import http from 'http'
import axios from 'axios'
import db, { ready } from '../src/models/db.mjs'
import { app } from '../src/index.mjs'

await ready  // garantiza el schema antes de queryar

const server = http.createServer(app)
await new Promise(r => server.listen(0, r))              // puerto efímero
const baseURL = `http://localhost:${server.address().port}`
const request = (method, path, body, token) => axios({
  method, url: baseURL + path, data: body,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  validateStatus: () => true                              // no lanzar: asserts en el test
})

// Setup: dos usuarios (A dueña, B para ownership check)
// Flujo: 401 sin token → 400 validación → 200 happy path → 404 ownership

await new Promise(r => server.close(r))
db.close()
```

- Cubrir: auth (sin token → 401, token mal → 403), validación (400), happy path (200), ownership (B no ve/edita/borra de A → 404), rotación de token en respuestas.
- `validateStatus: () => true` para que axios no lance y podamos comparar status.
- Correr: `cd backend && DB_PATH=./test.sqlite SECRET=test node tests/smoke-X.mjs`.

### Componente Vue (Options API + Pug + Stylus)

```vue
<template lang="pug">
.nombre
  // pug aquí, indentación sensible
</template>

<script>
import api from '../api.js'
export default {
  name: 'X',
  data () { return { /* estado */ } },
  computed: { /* derivados */ },
  async mounted () { await this.fetch() },
  methods: {
    async fetch () {
      try { const res = await api.get('/api/x'); this.items = res.data.data || [] }
      catch (e) { this.$toast.error('Could not load') }
    }
  }
}
</script>

<style lang="stylus" scoped>
.nombre
  // stylus con indentación; variables var(--primary) etc.
</style>
```

- Options API (sin `<script setup>`).
- `api` inyecta `Authorization` y rota el token automáticamente; consume `res.data.data` y `res.data.token` (ignorado por el interceptor).
- `$toast` disponible globalmente: `$toast.success|error|info(msg)`.
- Registrar ruta nueva en `router.js` con lazy import: `{ path: '/x', component: () => import('./components/X.vue') }`.

---

## Estado actual y próximos pasos

- **Completadas:** Épicas 0 a 13 (limpieza, modelo de datos, auth, CRUD de series, IMDB, dashboard, detalle, polish, deploy, RSS, `last_read` string, Facebook Reels, auto-detección de fuente RSS vs HTML scraper, header menu + renombrado de tipos).
- **Pendientes:** ninguna (todas las épicas documentadas hasta la fecha están completas).

Lee `PROJECT.md` para el índice de épicas y `epics/NN-*.md` para el detalle de cada una. Antes de tocar código, **lee la sección *Patrones del código* de este archivo** para no redescubrir los molds.
