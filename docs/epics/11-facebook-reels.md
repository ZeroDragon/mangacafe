# Épica 11 — Soporte para Facebook Reels (watch-later)

**Estado:** `[DONE]`
**Objetivo:** Nueva sección "Reels" que funciona como **watch-later / ToDo list** independiente del modelo de series. El usuario pega la URL de un reel de Facebook que quiere revisar después; opcionalmente le pone título; y lo va marcando como visto sin orden cronológico. El dashboard muestra un único card (con thumbnail fijo de FB) indicando cuántos reels faltan por ver.

**Depende de:** Épicas 1 (multiusuario + helpers DB), 5 (dashboard).
**Habilita:** guardar reels sueltos para ver después, sin mezclarlos con el tracking de series (que es cronológico y con feed).

---

## Contexto / motivación

Manga Café hoy trackea **series** con feed (anime por IMDB, manga por RSS): cada serie tiene muchos items ordenados por `pub_date`, y `markSeen` hace **cascada** (si llegaste al capítulo N, los N-1..1 también están leídos).

Ese modelo **no aplica** a un reel suelto de Facebook:

- Un reel **no tiene feed** ni episodios: es un item atómico (una URL).
- **No hay relación cronológica** entre reels: marcar uno como visto no afecta a los demás. La cascada de `series_items.markSeen` es activamente incorrecta aquí.
- El usuario no "avanza" en un reel: lo ve o no lo ve. Es un **ToDo**, no un historial.
- No hay portada propia ni metadata alcanzable de forma confiable (ver §Title detection).

Por eso se modela como una **tabla nueva** (`reels`) y una **sección nueva** de la UI (`/reels`), en paralelo a series. Reutilizar el modelo `series` + `series_items` rompería invariantes (cascada, feed, badge de pendientes por serie, dashboard agregado por serie).

### Decisión de producto (nueva — agregar a `AGENTS.md` y `PROJECT.md`)

| # | Decisión | Valor |
|---|----------|-------|
| 10 | Reels como tabla aparte | Los reels de FB se guardan en `reels` (no en `series`). Marcar visto es **por-item sin cascada**. Funciona como watch-later / ToDo: pendientes arriba, vistos en sección separada. El dashboard muestra un único card con thumbnail fijo (Épica 11). |

---

## Alcance

### 1. Modelo de datos — nuevo — `backend/src/models/db.mjs`

```sql
CREATE TABLE reels (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  CONSTRAINT reels_users_FK FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT reels_uniq UNIQUE (user_id, url)
);
CREATE INDEX idx_reels_user ON reels(user_id);
CREATE INDEX idx_reels_user_unseen ON reels(user_id, seen);
```

- `UNIQUE (user_id, url)`: no duplicar el mismo reel para el mismo usuario (mismo `INSERT OR IGNORE` que `series_items`).
- `seen`: 0 = pendiente, 1 = visto. **Independiente por item** (sin cascada, sin `last_read`).
- `createTable('reels', …)` en el `Promise.all` de tablas del `ready`. No hace falta migración de bases existentes (tabla nueva).
- `PRAGMA foreign_keys = ON` ya está activo por conexión → `ON DELETE CASCADE` funciona al borrar usuario.

### 2. Modelo — nuevo — `backend/src/models/reel.mjs`

CRUD mínimo, análogo a `series.mjs` pero más simple (sin feed, sin `last_read`):

- `create(userId, { url, title })` — `INSERT OR IGNORE` sobre `(user_id, url)`; devuelve `{ id }` o `{ skipped: true }` si ya existía.
- `listByUser(userId)` — todos los reels del usuario, ordenados por `created_at DESC` (más reciente primero dentro de cada sección). No se junta con vistos en UI, pero la query trae ambos y el front separa por `seen`.
- `update(userId, id, { url, title })` — editar url/título (whitelist `[url, title]`). Ownership: `WHERE id = ? AND user_id = ?`.
- `remove(userId, id)` — borrar. Ownership check.
- `markSeen(userId, id)` / `markUnseen(userId, id)` — toggle del flag `seen`. **Sin cascada.** Ownership check.
- `pendingCountByUser(userId)` — `COUNT(*) WHERE seen = 0`. Para el summary del dashboard.

### 3. Title detection — best-effort — `backend/src/reel_fetch.mjs` (nuevo)

El usuario pregunta si un "curl sencillo" puede sacar el título del reel. **Respuesta realista: no de forma confiable.** Facebook:

- Sirve la mayoría de páginas públicas con HTML server-rendered que **sí** incluye `<meta property="og:title">` y `<title>`, pero…
- …para muchos reels (privados, de perfiles, anti-bot) devuelve un **login wall** o un challenge de `mbasic`/JS que no contiene el título real.
- Bloquea User-Agents obvios de bots; hay que mandar uno de navegador realista.

Implementación best-effort que se invoca **sólo si el usuario no manda `title`** en el `POST /api/reels`:

1. `axios.get(url, { headers: { 'User-Agent': REEL_USER_AGENT }, responseType: 'text', timeout: REEL_TIMEOUT })`.
2. Regex sobre el HTML para extraer `og:title` (más confiable que `<title>` que suele ser "Log in to Facebook | Facebook").
3. Si encuentra algo no vacío y no trivial (descartar strings como "Facebook", "Log in", etc.) → usarlo.
4. Si no → `title = null` (la UI muestra la URL recortada como fallback).

**Env vars nuevas** (análogas a `IMDB_*` / `RSS_*`):
- `REEL_USER_AGENT` — UA realista (default: un Chrome desktop reciente).
- `REEL_TIMEOUT` — ms (default 8000; los reels a veces tardan).

**El title nunca bloquea el alta**: si el fetch falla o no encuentra nada, el reel se crea igual con `title = null`. El usuario puede editarlo a mano después.

### 4. Endpoints — `backend/src/index.mjs`

Todas bajo `/api/reels`, protegidas con `[verifyToken, getUser, resolveUserId]`:

- `GET /api/reels` → `{ data: [...] }` (pendientes + vistos juntos; el front separa).
- `POST /api/reels` → `{ url, title? }`. Si no viene `title`, intenta `reel_fetch.detectTitle(url)` (best-effort). Devuelve `{ id, title }` o `{ skipped: true }` si ya existía la URL.
- `PUT /api/reels/:id` → `{ url?, title? }`. Whitelist. Ownership.
- `DELETE /api/reels/:id` → borrado. Ownership.
- `POST /api/reels/:id/seen` → `markSeen`. Ownership. **No cascade.**
- `DELETE /api/reels/:id/seen` → `markUnseen`. Ownership.

**Dashboard (extender el existente):**
- `GET /api/dashboard` ahora also retorna `summary.reelsPending` (`reel.pendingCountByUser(userId)`).
- El card de reels se renderiza en el front a partir de ese número (no es parte de `data: [...]`, que sigue siendo solo series).

### 5. Frontend

#### Asset fijo — `frontend/public/reel-thumb.png`

Descargar la imagen `https://popsters.ru/blog/content/all/mceu0sljejiz7918nlnkmrqk1xmqbq4or.png` a `frontend/public/reel-thumb.png` (commitada al repo). Sirve como thumbnail **fijo** del card de Reels en el dashboard y como favicon de la sección. Razones para hostear local y no hot-linkear: (a) no depender de popsters.ru (CORS/uptime), (b) evitar referrer/headers raros, (c) tamaño conocido.

#### Card en el dashboard — `Dashboard.vue`

Un **SeriesCard reutilizado** con un objeto sintético:

```js
{
  id: 'reels',           // marker para que el card linkee a /reels en vez de /series/:id
  type: 'reel',          // nuevo type-badge "Reels" (amarillo/otro color para diferenciar)
  name: 'Facebook Reels',
  cover_url: '/reel-thumb.png',
  pending: summary.reelsPending,
  last_item_title: summary.reelsPending > 0 ? `${summary.reelsPending} to watch` : null,
  last_read: null        // ocultar la línea "Last read" para este caso (SeriesCard ya la oculta si null… ajustar para mostrar N/A)
}
```

Click → `/reels`. Como `SeriesCard` hoy linkea el nombre a `/series/:id`, hay dos opciones:
- **(a)** Agregar un prop `to` (override del router-link) — minimal.
- **(b)** Hacer un componente `ReelCard` dedicado — duplicación.

**Decisión: (a)** — prop `to` en `SeriesCard` con default `/series/${series.id}`. Mínimo cambio, máxima reutilización.

#### Sección Reels — nuevo — `frontend/src/components/Reels.vue`

Ruta `/reels`, link en `AppHeader.vue` (icono `movie` o `smart_display`).

Layout tipo ToDo:

```
[Form: URL input + Title input (opcional) + Add button]

── To watch (N) ──────────────
  [thumbnail FB]  Título o URL recortada        [open] [edit] [seen ✓]
  [thumbnail FB]  Título o URL recortada        [open] [edit] [seen ✓]
  ...

── Watched (M) ───────────────
  [thumbnail FB]  Título o URL recortada        [open] [edit] [unsee ↩]
  ...
```

- **To watch** (`seen = 0`): cada item muestra título (o URL recortada si `title = null`), link "open" (a `reel.url` en nueva pestaña), botón edit (inline o modal chico), botón "✓ seen".
- **Watched** (`seen = 1`): lo mismo pero el botón principal es "↩ unsee" (vuelve a pendiente). Visualmente atenuado (opacity, sin badge).
- **Edit URL/título**: modal o fila expandible con dos inputs + Save/Cancel. Llama a `PUT /api/reels/:id`.
- **Sin refresh automático**: no hay feed. El usuario explícitamente agrega/edita/marca.
- **Thumbnail por item**: hay dos opciones:
  - **(i)** Todos usan `/reel-thumb.png` (igual que el card del dashboard). Simple, consistente.
  - **(ii)** Intentar sacar el thumbnail real del reel (otra vez scraping de `og:image`). Mismo problema que el título: no confiable.

**Decisión: (i)** — thumbnail fijo para todos los items. Coherente con el dashboard y evita más scraping frágil.

#### AppHeader — `frontend/src/components/AppHeader.vue`

Nuevo link:
```pug
router-link(:to="{ path: '/reels' }")
  span.material-symbols-outlined smart_display
  span.label Reels
```

#### Router — `frontend/src/router.js`

```js
{ path: '/reels', component: () => import('./components/Reels.vue') }
```

### 6. Validación — `backend/src/index.mjs`

`validateReel(body, partial)`:
- `url`: requerida (en POST), http(s) URL válida. En PUT opcional pero si viene validar formato. Aceptamos cualquier host (no solo `facebook.com`) — el usuario puede pegar URLs de `fb.watch`, `m.facebook.com`, etc.
- `title`: opcional, string no vacío si viene. **No** se valida longitud máxima (los `og:title` de FB pueden ser largos).
- En PUT se permite mandar `title: null` explícito para "limpiar" el título y volver al fallback de URL.

### 7. Env vars — `env_example`

```
REEL_USER_AGENT "User-Agent for best-effort FB reel title fetch (e.g. Mozilla/5.0 ... Chrome/...)"
REEL_TIMEOUT "ms for FB reel HTTP requests (e.g. 8000)"
```

---

## Migración de datos

Ninguna. Tabla nueva `reels`; bases existentes la crean al boot vía `createTable` (idempotente). Sin backfill.

---

## Tareas

### Backend
- [x] `backend/src/models/db.mjs`: `createTable('reels', …)` + índices en el `Promise.all` del `ready`.
- [x] `backend/src/models/reel.mjs` (nuevo): `create`, `listByUser`, `update`, `remove`, `markSeen`, `markUnseen`, `pendingCountByUser`. Ownership en todas.
- [x] `backend/src/reel_fetch.mjs` (nuevo): `detectTitle(url)` best-effort (`og:title` regex sobre GET con UA realista, fallback `null`).
- [x] `backend/src/index.mjs`: rutas `/api/reels` (GET/POST/PUT/DELETE + `/seen` toggle); `validateReel`; ampliar `GET /api/dashboard` con `summary.reelsPending`.
- [x] `env_example`: `REEL_USER_AGENT`, `REEL_TIMEOUT`.

### Frontend
- [x] `frontend/public/reel-thumb.png`: descargar desde la URL de popsters y commitear.
- [x] `frontend/src/router.js`: ruta `/reels`.
- [x] `frontend/src/components/AppHeader.vue`: link "Reels".
- [x] `frontend/src/components/SeriesCard.vue`: prop `to` (override del router-link) + badge "Reels" + ocultar "Last read" para reels.
- [x] `frontend/src/components/Dashboard.vue`: inyectar un SeriesCard sintético para Reels al inicio del grid usando `summary.reelsPending` y `/reel-thumb.png`.
- [x] `frontend/src/components/Reels.vue` (nuevo): ToDo de dos secciones (To watch / Watched) con form de alta, edit inline de url/título, toggle seen.

### Tests
- [x] `backend/tests/smoke-reels.mjs` (nuevo): cubre POST/PUT/DELETE/seen/unsee + ownership (B no ve/edita/borra reels de A) + `UNIQUE(user_id, url)` (segundo POST misma URL → `skipped`) + `pendingCountByUser`.
- [x] `backend/tests/smoke-dashboard.mjs`: ampliar para verificar `summary.reelsPending` (crear 3 reels, 1 visto → `reelsPending = 2`).
- [x] Title detection: smoke con `extractFromHtml` (sin red) para cubrir happy path (encuentra `og:title`), login wall trivial y fallback (`title = null`).

## Verificación

- [x] `POST /api/reels` con URL válida y sin título → crea con `title = null` o con `og:title` si el fetch lo encontró.
- [x] `POST /api/reels` con la misma URL otra vez → `skipped: true` (no duplica).
- [x] `POST /api/reels/:id/seen` cambia el flag y **no** toca otros reels (sin cascada).
- [x] `DELETE /api/reels/:id/seen` lo vuelve a pendiente.
- [x] `PUT /api/reels/:id` actualiza url y/o título; rechaza campos fuera del whitelist.
- [x] Ownership: B no ve/edita/borra/marca reels de A (404 en todos).
- [x] `GET /api/dashboard` incluye `summary.reelsPending` correcto.
- [x] Card de Reels aparece en el dashboard con la thumbnail fija, count de pendientes y link a `/reels`.
- [x] `/reels` muestra dos secciones (To watch / Watched), el form de alta, edit de items y el toggle entre secciones al marcar.

## Cómo reproducir la verificación

- **Backend:** `cd backend && DB_PATH=./test.sqlite node tests/smoke-reels.mjs`.
- **Regresión dashboard:** `cd backend && DB_PATH=./test.sqlite node tests/smoke-dashboard.mjs`.
- **Frontend:** `cd frontend && API=http://localhost:3000 BUILD_OUT_DIR=dist npm run build`.
- **Manual:** levantar dev, pegar una URL pública de un reel de FB, ver el alta con/sin título, marcarlo visto, ver que pasa a "Watched", editarlo, desmarcarlo.

---

## Alternativas consideradas

- **Reusar `series` con `type='reel'` y un solo `series_item` por reel.** Descartado: rompe invariantes (la cascada de `markSeen` marcaría items "anteriores" que no existen, el badge de pendientes se mezcla con series reales, el `last_read` no tiene sentido). Una tabla nueva es más simple y deja el modelo de series limpio.
- **Title real vía `og:image` además de `og:title`.** Descartado por la misma razón que el título no es confiable: FB bloquea/bloquea parcialmente el scraping. Se usa thumbnail fijo para no sumar una segunda fuente de fallo.
- **Title vía la API oficial de Facebook Graph.** Descartado: requiere app review + token de usuario + permisos especiales para leer contenido público, overhead absurdo para un watch-later personal.
- **Card de Reels dedicado (`ReelCard.vue`) en vez de reusar `SeriesCard` con prop `to`.** Descartado: el `SeriesCard` ya renderiza portada + badge + nombre + línea de pendientes, que es justo lo que se necesita. Un prop `to` de una línea resuelve el link.
- **Sección "Shorts" en vez de "Reels".** "Reels" es el nombre del producto de Facebook (que es lo que el usuario quiere trackear). "Shorts" es YouTube. Aunque la feature sería equivalente para cualquier plataforma, el nombre inicial es "Reels" y la implementación no acopla a FB (acepta cualquier URL).

---

## Archivos a modificar / crear

- `backend/src/models/db.mjs` (`createTable('reels', …)` + índices).
- `backend/src/models/reel.mjs` (nuevo).
- `backend/src/reel_fetch.mjs` (nuevo, best-effort title detection).
- `backend/src/index.mjs` (rutas `/api/reels` + `summary.reelsPending` en dashboard).
- `backend/tests/smoke-reels.mjs` (nuevo); `smoke-dashboard.mjs` (ampliar).
- `frontend/public/reel-thumb.png` (nuevo, descargado desde popsters).
- `frontend/src/router.js` (ruta `/reels`).
- `frontend/src/components/AppHeader.vue` (link Reels).
- `frontend/src/components/SeriesCard.vue` (prop `to`).
- `frontend/src/components/Dashboard.vue` (card sintético de Reels).
- `frontend/src/components/Reels.vue` (nuevo).
- `env_example` (`REEL_USER_AGENT`, `REEL_TIMEOUT`).
- `docs/AGENTS.md` y `docs/PROJECT.md` (decisión 10 + fila en la tabla de épicas).
