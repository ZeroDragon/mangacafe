# Manga Café — Arquitectura

Detalle técnico del scaffolding conservado tras la Épica 0 y extendido por las épicas siguientes. **Referencia canónica para implementar features nuevas.**

> **Mantener al día (regla 13 de `AGENTS.md`):** cada cambio de código (tabla nueva, endpoint nuevo, middleware nuevo, env var nueva) DEBE actualizar las secciones correspondientes de este archivo **en el mismo cambio**. La próxima sesión de un agente lo va a leer primero.

---

## Backend (`backend/`)

### Boot (`src/index.mjs`)
- Carga env con `../../dotenv.mjs`.
- `express()` con `express.json()`.
- CORS permisivo (`*`, métodos, header `Authorization`).
- View engine Pug registrado (`app.set('view engine', 'pug')`) — actualmente sin `res.render()`, queda disponible si se quiere SSR.
- **Arranque:** espera `dbReady.finally(...)` para iniciar el scheduler IMDB (evita race condition con tablas inexistentes) y luego `app.listen(PORT)`.
- **Smoke tests:** el módulo detecta `process.argv[1].includes('tests/')` y NO llama a `app.listen` (los tests levantan su propio servidor efímero con `http.createServer(app)`).

### Rutas actuales (post-Épica 11)
- `GET /api/` — health.
- `POST /api/signup` — `{ username, password }` → `{ success }` o `{ error }`.
- `POST /api/login` — `{ username, password }` → `{ success, token }` o 401 `{ error }`.
- `GET /api/me` (protegida) → `{ username, token }` (token rotado).

**Series (Épica 3):**
- `GET /api/series` — lista del usuario.
- `POST /api/series` — alta (valida type IN ('manga','anime'), dispatch imdb_url/rss_url por type).
- `GET /api/series/:id` — detalle (404 si ajena).
- `PUT /api/series/:id` — update con whitelist; `current_chapter` legacy se ignora.
- `DELETE /api/series/:id` — borrado (cascade a `series_items`).

**Feeds y dashboard (Épicas 4-6, 9):**
- `POST /api/refresh` — refresca todas las series **del usuario** (on-demand dev).
- `POST /api/series/:id/refresh` — refresca una serie.
- `GET /api/dashboard` — series + `summary { totalPending, withUpdates, total, reelsPending }`.
- `GET /api/series/:id/feed` — items ordenados por `pub_date DESC`.
- `POST /api/series/:id/items/:itemId/seen` — **cascada**: marca ese y los anteriores.
- `DELETE /api/series/:id/items/:itemId/seen` — **cascada** inversa.
- `POST /api/series/:id/seen-all` — marca todos los pendientes como vistos.

**Crunchyroll (sync externo, on-demand):**
- `POST /api/crunchyroll/sync` — `{ email, password }` → watchlist normalizada.
- `GET /api/crunchyroll/resolve?name=&season=` — resuelve ttId/poster/imdbUrl.

**Reels (Épica 11):** watch-later independiente de series, **sin cascada**.
- `GET /api/reels` — pendientes + vistos juntos (el front separa por `seen`).
- `POST /api/reels` — `{ url, title? }` (title se autodetecta con `reel_fetch.detectTitle` si no viene).
- `PUT /api/reels/:id` — update con whitelist `[url, title]`; `title: null` explícito limpia.
- `DELETE /api/reels/:id`.
- `POST /api/reels/:id/seen` — toggle a visto (un solo item).
- `DELETE /api/reels/:id/seen` — toggle a pendiente.

**Sources preview (Épica 14):**
- `POST /api/sources/preview` — `{ url, config: { selector, url_attr?, label_attr?, reverse? } }` → `{ items: [{title, link}], count }` (dry-run del adapter custom, no persiste).

### Middlewares exportados (reutilizar en rutas protegidas)
```js
import { verifyToken, getUser, resolveUserId } from './index.mjs'
// app.get('/api/x', [verifyToken, getUser, resolveUserId], handler)
// res.username, res.userId, res.newToken quedan disponibles
```
- `verifyToken`: lee `Authorization: Bearer <token>`, valida firma y expiración, deja `res.newToken` (token rotado). 401 sin header, 403 token inválido.
- `getUser`: parsea `res.newToken` y deja `res.username`.
- `resolveUserId`: lookup `users WHERE username = res.username` y deja `res.userId` (el token no lleva el id, solo el username). 401 si no existe.

> Toda mutación/query a `series`/`series_items`/`reels` filtra por `res.userId`.

> **Nota de refactor futuro:** mover `verifyToken`/`getUser`/`resolveUserId` a un módulo `src/middleware.mjs` cuando crezcan las rutas, para evitar importar desde `index.mjs`.

### Auth (`src/auth.mjs`)
JWT custom (sin librería externa). Token = `<base64url payload>.<HMAC-SHA256>`.
- Payload: `{ timestamp, expiration, meta: { username } }`.
- Expiración por defecto: **1 año**.
- Métodos: `generateToken(data)`, `verifyToken(token)`, `refreshToken(token)`, `parseToken(token)`.
- Firma con `crypto.createHmac('sha256', process.env.SECRET)`.

### DB (`src/models/db.mjs`)
- `new sqlite3.Database(process.env.DB_PATH)` — driver con callbacks.
- `PRAGMA foreign_keys = ON` por conexión (necesario para que `ON DELETE CASCADE` funcione).
- Helpers: `createTable(table, schema)`, `createIndex(name, schema)` (idempotentes), `renameColumnIfMissing`, `addColumnIfMissing`, `dropColumnIfExists` (migraciones sobre bases existentes).
- Export `ready` (Promise que se resuelve cuando todas las tablas e índices están creados) — los tests lo `await`; el boot lo usa para arrancar el scheduler.
- El schema se inicializa al importar el módulo (side-effect del `Promise.all`).

### Schema actual (post-Épica 14)

```sql
users (id, username UNIQUE, password, created_at)

series (
  id, user_id FK→users ON DELETE CASCADE,
  type TEXT CHECK IN ('manga','anime'),
  name, url, cover_url,
  last_read TEXT,              -- Épica 10: string, title del último item visto
  imdb_url TEXT,               -- feed si type='anime'
  rss_url TEXT,                -- feed si type='manga'
  source_config TEXT,          -- Épica 14: JSON {selector,url_attr?,label_attr?,reverse?} para scraping genérico (manga only)
  last_known_total, last_checked_at, last_error,
  created_at, updated_at
)

series_items (
  id, series_id FK→series ON DELETE CASCADE,
  guid, title, link, pub_date,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at,
  UNIQUE(series_id, guid)
)

reels (                        -- Épica 11: watch-later, sin feed, sin cascada
  id, user_id FK→users ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,                  -- nullable; la UI muestra URL recortada como fallback
  seen INTEGER NOT NULL DEFAULT 0,
  created_at, updated_at,
  UNIQUE(user_id, url)
)
```

**Índices:** `idx_series_user`, `idx_series_user_type`, `idx_series_last_checked`, `idx_items_series`, `idx_items_series_unseen`, `idx_reels_user`, `idx_reels_user_unseen`.

**Pendientes (series)** = `COUNT(*)` de `series_items` con `seen=0`. **Pendientes (reels)** = `COUNT(*)` de `reels` con `seen=0`.

### Modelos (`src/models/`)

| Archivo | Funciones clave | Notas |
|---------|-----------------|-------|
| `user.mjs` | `signup`, `login`, `getBy`, `update` | bcrypt cost 10. |
| `series.mjs` | `create`, `listByUser`, `getById`, `update`, `remove` | `ALLOWED_FIELDS` whitelist. Ownership `WHERE id=? AND user_id=?`. |
| `series_item.mjs` | `insertMany` (OR IGNORE), `markSeen`/`markUnseen` (**cascada**), `markAllSeen`, `markSeenUpTo`, `recomputeLastRead`, `dashboardByUser`, `pendingCount`, `deleteFuture` | `markSeen` actualiza en cascada items con `pub_date <=`; tras mutar `seen`, llama a `recomputeLastRead` que rebaja el nuevo `last_read` desde el item visto más reciente. |
| `reel.mjs` | `create`, `listByUser`, `update`, `remove`, `markSeen`/`markUnseen`, `pendingCountByUser` | **Sin cascada**: marcar un reel no toca los demás. `create` usa `INSERT OR IGNORE` y devuelve `{skipped:true}` si la URL ya existía. |

Todos los modelos devuelven Promises con `{success|error|skipped|data}`, nunca lanzan.

### Refresher (`src/refresher.mjs`)
- `refreshSeries(s)` despacha por `type`: anime → `imdb.mjs`; manga → `sources.fetchItems` (Épica 12: orquestador que auto-detecta RSS vs HTML scraper por host + sniff). Setea `last_error` en fallo (no revienta).
- `refreshAll()` recorre todas las series de todos los usuarios (con `DELAY_BETWEEN_FETCHES_MS = 800ms`).
- `refreshByUser(userId)` respeta ownership.
- `startScheduler({intervalMs=6h, runImmediately=true})` corre al boot en producción; `unref()` para no mantener vivo el proceso en tests.

### Sources (`src/sources/`) — Épicas 12 + 14
Orquestador de fuentes para mangas: el refresher solo llama `sources.fetchItems(url, opts?)` y este módulo decide la implementación.
- `index.mjs`: `fetchItems(url, opts)` + `detectSource({ url, contentType, body })`. Algoritmo: (0) si `opts.config` → adapter custom (Épica 14, prioridad absoluta); (1) host conocido (comivex.com) → adapter registrado; (2) GET + sniff (Content-Type `*/xml` o body con `<rss`/`<feed`/`<?xml` → rss; body `<html` y host con adapter → adapter; HTML sin adapter → throw `unsupported source`); (3) default rss (backward compat).
- `rss.mjs`: adapter RSS, wrapper delgado sobre `parseFeed` (`src/rss.mjs`).
- `comivex.mjs`: adapter de comivex.com (cheerio); hace su propio GET con UA de browser; produce items con guid estable `comivex:{mangaId}:{chapterNumber}`. Hosts: `comivex.com`, `www.comivex.com`. Env vars: `COMIVEX_USER_AGENT`, `COMIVEX_TIMEOUT`.
- `custom.mjs` (**Épica 14**): adapter genérico con config de usuario (cheerio; sin deps nuevas, sin `vm`). Recibe `{ url, config: { selector, url_attr, label_attr, reverse } }`, fetchea el HTML, aplica el selector + extrae los atributos + opcionalmente invierte el orden, y normaliza a items con guid estable `custom:{sha256(link)[:16]}`. Env vars: `CUSTOM_SOURCE_USER_AGENT`, `CUSTOM_SOURCE_TIMEOUT`.

Sumar un proveedor nuevo = un archivo `src/sources/<host>.mjs` que exporte un adapter con `{ name, hosts, fetch(url), parse(body, url) }` y agregarlo al array `HOST_ADAPTERS` en `index.mjs`. Para sitios sin adapter dedicado, el usuario carga la config desde el form (advanced mode) — el adapter `custom.mjs` los cubre sin código nuevo.

---

## Frontend (`frontend/`)

### Entry
- `index.html`: carga `src/styles.styl`, Google Fonts (Material Symbols + Open Sans), monta `#app`, ejecuta `src/main.js`.
- `main.js`: `createApp` con build `vue/dist/vue.esm-bundler` (runtime+compiler). Router con `createWebHistory`. Instala el plugin `storage`.

### Router (`src/router.js`)
```
/                → redirect /dashboard
/login           → Login.vue        (pública)
/dashboard       → Dashboard.vue
/series          → SeriesList.vue
/series/new      → SeriesForm.vue
/series/:id      → SeriesDetail.vue
/series/:id/edit → SeriesForm.vue
/crunchyroll     → Crunchyroll.vue
/reels           → Reels.vue        (Épica 11)
```
Guard global `beforeEach`: si no hay `localStorage.token` y no se va a `/login`, redirige a `/login`; si hay token y se va a `/login`, redirige a `/dashboard`.

### Plugins globales (registrados en `main.js`)
- `$storage` (`storage.js`): reactive simple con `set/get/remove` sobre `store.state`. Sin persistencia en localStorage.
- `$toast` (`toast.js`): manager `{ info, success, error, dismiss }`. Mensajes auto-dismiss a los 3.5s. Componente `Toasts.vue` los renderiza.

### HTTP helper (`src/api.js`)
Instancia axios con `baseURL = __API__`. Interceptores:
- **Request:** adjunta `Authorization: Bearer <localStorage.token>` si existe.
- **Response ok:** si el body trae `token`, lo guarda en `localStorage.token` (rotación).
- **Response error 401:** limpia `localStorage.token` y dispara `onUnauthorized` (registrado desde `main.js`) que redirige a `/login`.

### Vite (`vite.config.js`)
- Plugins: `@vitejs/plugin-vue` + `dotPathFixPlugin` (SPA fallback: cualquier path no `/@`, no `/api/` y que no exista en `public/` se reescribe a `/`).
- `define`: `__API__` → `env.API` (string inyectada en build).
- `build.outDir` = `env.BUILD_OUT_DIR`.
- Carga env con `../dotenv.mjs`.
- **No hay `server.proxy`**: el frontend golpea el backend directo por CORS.

### Estilos (`src/styles.styl`)
Variables CSS globales:
```stylus
:root
  --background: #0f141c
  --foreground: #ddd
  --primary: #2b5278
  --danger: tomato
```
Tipografía: Open Sans. Iconos: Material Symbols Outlined (clase `.material-symbols-outlined`).

### Convenciones de SFC
- `<template lang="pug">` (Pug en los templates).
- `<style lang="stylus" scoped>`.
- Sin `<script setup>` en el código heredado (Options API). Mantener Options API para consistencia salvo que se decida migrar.

---

## Env (formato `dotenv.mjs`)

Archivo `.env` en el **root del repo**, formato **`KEY value`** separado por **un solo espacio** (no `=`). El loader splitea por línea y luego por el primer espacio; el resto se une como valor.

```
PORT 3000
DB_PATH ./dev.sqlite
API http://localhost:3000
SECRET string-aleatorio
IMDB_USER_AGENT "..."
IMDB_TIMEOUT 15000
IMDB_GRAPHQL_ENDPOINT "..."     # opcional, override
IMDB_TZ "America/Mexico_City"   # opcional, default tz del sistema
RSS_USER_AGENT "..."
RSS_TIMEOUT 15000
COMIVEX_USER_AGENT "..."        # Épica 12
COMIVEX_TIMEOUT 15000           # Épica 12
CUSTOM_SOURCE_USER_AGENT "..."  # Épica 14 (generic source-config scraper)
CUSTOM_SOURCE_TIMEOUT 15000     # Épica 14
REEL_USER_AGENT "..."           # Épica 11
REEL_TIMEOUT 8000               # Épica 11
BUILD_OUT_DIR dist              # o /srv/www/mangacafe.vip en prod
```

`env_example` documenta todas las variables con descripciones. Variables eliminadas en Épica 0: `TELEGRAM_TOKEN`, `TELEGRAM_BOT`, `ORIGIN`. **Cada var nueva DEBE agregarse a `env_example`** (regla 13).

---

## Infra

### PM2 (`backend/ecosystem.config.cjs`)
App `mangacafe`, 1 instancia, `max_memory_restart 100M`, `cron_restart: '0 0 * * *'` (diario). **La Épica 8 lo cambia a cada 6h** o lo reemplaza por un scheduler interno.

### Deploy (`.github/workflows/deploy.yml`)
Manual (`workflow_dispatch`). `scp` al server → escribe `.env` desde secrets → `npm i` en frontend y backend → `vite build` → `pm2 restart mangacafe`.

### Git ignore
`node_modules/`, `*.env`, `*.sqlite`, `.DS_Store`, y en el root un `*.*` con `!.gitignore` muy permisivo (cuidado al commitear).

---

## Schema de DB

Definitivo desde la Épica 11. Ver sección **Schema actual** arriba en este mismo archivo. Para el contrato completo con migraciones y `CHECK` constraints, leer directamente `backend/src/models/db.mjs` (es la fuente de verdad).
