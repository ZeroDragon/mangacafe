# Manga Café — Arquitectura

Detalle técnico del scaffolding conservado tras la Épica 0. Referencia para implementar las épicas siguientes.

---

## Backend (`backend/`)

### Boot (`src/index.mjs`)
- Carga env con `../../dotenv.mjs`.
- `express()` con `express.json()`.
- CORS permisivo (`*`, métodos, header `Authorization`).
- View engine Pug registrado (`app.set('view engine', 'pug')`) — actualmente sin `res.render()`, queda disponible si se quiere SSR.
- Escucha en `process.env.PORT`.

### Rutas actuales
- `GET /api/` — health.
- `POST /api/signup` — `{ username, password }` → `{ success }` o `{ error }`.
- `POST /api/login` — `{ username, password }` → `{ success, token }` o 401 `{ error }`.
- `GET /api/me` (protegida, `[verifyToken, getUser]`) → `{ username, token }` (token rotado).

### Middlewares exportados (reutilizar en rutas protegidas)
```js
import { verifyToken, getUser } from './index.mjs' // o co-ubicar
// app.get('/api/series', [verifyToken, getUser], handler)
// res.username queda disponible; res.newToken es el token rotado
```
- `verifyToken`: lee `Authorization: Bearer <token>`, valida firma y expiración, deja `res.newToken`.
- `getUser`: parsea `res.newToken` y deja `res.username`.

> **Nota de refactor futuro:** mover `verifyToken`/`getUser` a un módulo `src/middleware.mjs` cuando crezcan las rutas, para evitar importar desde `index.mjs`.

### Auth (`src/auth.mjs`)
JWT custom (sin librería externa). Token = `<base64url payload>.<HMAC-SHA256>`.
- Payload: `{ timestamp, expiration, meta: { username } }`.
- Expiración por defecto: **1 año**.
- Métodos: `generateToken(data)`, `verifyToken(token)`, `refreshToken(token)`, `parseToken(token)`.
- Firma con `crypto.createHmac('sha256', process.env.SECRET)`.

### DB (`src/models/db.mjs`)
- `new sqlite3.Database(process.env.DB_PATH)` — driver con callbacks.
- Helper `createTable(table, schema)` devuelve `Promise`, crea solo si no existe.
- Las tablas se inicializan al importar el módulo (side-effect del `Promise.all`).
- **Schema actual (post-Épica 0):** solo `users(id, username UNIQUE, password, created_at)`.

### Modelo user (`src/models/user.mjs`)
- `signup(username, password)` — dedupe por username, hashea con **bcrypt** (cost factor 10).
- `login(username, password)` — trae el row por username y valida con `bcrypt.compare`.
- `getBy(selector, match)`, `update(destination, value, selector, match)`.
- Todas devuelven Promises con `{ success }` o `{ error }`.

---

## Frontend (`frontend/`)

### Entry
- `index.html`: carga `src/styles.styl`, Google Fonts (Material Symbols + Open Sans), monta `#app`, ejecuta `src/main.js`.
- `main.js`: `createApp` con build `vue/dist/vue.esm-bundler` (runtime+compiler). Router con `createWebHistory`. Instala el plugin `storage`.

### Router (`src/router.js`)
```
/         → redirect /dashboard
/login    → Login.vue        (pública)
/dashboard → Dashboard.vue    (protegida)
```
Guard global `beforeEach`: si no hay `localStorage.token` y no se va a `/login`, redirige a `/login`; si hay token y se va a `/login`, redirige a `/dashboard`.

### Plugin storage (`src/storage.js`)
Store `reactive` simple con `set/get/remove` sobre `store.state`. Sin persistencia en localStorage por ahora (se limpió la lógica de MangaDex). Si se necesita caché local, agregar bajo este plugin.

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
```

`env_example` documenta las variables. Variables eliminadas en Épica 0: `TELEGRAM_TOKEN`, `TELEGRAM_BOT`, `ORIGIN`. La Épica 8 agregará `RSS_USER_AGENT` y `RSS_TIMEOUT`.

---

## Infra

### PM2 (`backend/ecosystem.config.cjs`)
App `mangacafe`, 1 instancia, `max_memory_restart 100M`, `cron_restart: '0 0 * * *'` (diario). **La Épica 8 lo cambia a cada 6h** o lo reemplaza por un scheduler interno.

### Deploy (`.github/workflows/deploy.yml`)
Manual (`workflow_dispatch`). `scp` al server → escribe `.env` desde secrets → `npm i` en frontend y backend → `vite build` → `pm2 restart mangacafe`.

### Git ignore
`node_modules/`, `*.env`, `*.sqlite`, `.DS_Store`, y en el root un `*.*` con `!.gitignore` muy permisivo (cuidado al commitear).

---

## Contrato de datos pendiente (se define en Épica 1)

Aproximación del schema objetivo (no definitivo hasta Épica 1):

```sql
-- ya existe
users (id, username UNIQUE, password, created_at)

-- Épica 1
series (
  id, user_id FK, type IN ('manga','anime'),
  name, url, cover_url, current_chapter INT default 0,
  rss_url NULL, last_known_total NULL, last_checked_at NULL,
  last_error NULL, created_at, updated_at
)

series_items (
  id, series_id FK, guid, title, link, pub_date,
  seen INT default 0, created_at,
  UNIQUE(series_id, guid)
)
```

**Pendiente = `COUNT(*)` de `series_items` con `seen=0`** para esa serie. Marcar items `seen=1` al avanzar.
