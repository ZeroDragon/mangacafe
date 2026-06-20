# Épica 4 — Motor RSS

**Estado:** `[DONE]`
**Objetivo:** Refrescar feeds RSS de las series, deduplicar items y mantener actualizado el conteo de pendientes y los errores visibles.

**Depende de:** Épica 1 (tablas `series` + `series_items`).
**Habilita:** Épicas 5, 6 (necesitan datos de RSS para mostrar).

---

## Alcance

### Parser
- `xml2js` (sin agregar deps) en `backend/src/rss.mjs`.
- Normaliza **RSS 2.0** (`<rss><channel><item>`) y **Atom** (`<feed><entry>`).

### Refresco de una serie (`refreshSeries(series)`)
1. Si `rss_url` es NULL/empty → `{ skipped: true }`.
2. `axios.get` con `User-Agent` configurable (`RSS_USER_AGENT`) y timeout (`RSS_TIMEOUT`).
3. `parseFeed(xml)` → `{ guid, title, link, pub_date }`.
4. `series_item.insertMany` (dedupe por `UNIQUE(series_id, guid)`).
5. Actualiza `last_known_total`, `last_checked_at = now`, `last_error = NULL`.
6. En fallo: `last_error = mensaje` (decisión 7), sin revienta el job.

### Scheduler
- **`setInterval` interno** cada 6h (decisión 5) + refresh al boot (`runImmediately`). Arranca solo cuando `index.mjs` se ejecuta directamente (`if (isMain)`), no en tests.
- Delay de 800ms entre fetches (rate-limit suave).
- `setInterval.unref()` para no mantener vivo el proceso solo por el interval.

### Endpoints on-demand (dev / UX)
- `POST /api/refresh` — refresca las series del usuario actual.
- `POST /api/series/:id/refresh` — refresca una sola serie (ownership → 404).

---

## Tareas

- [x] `backend/src/rss.mjs` con `parseFeed(xml)` → array de items normalizados (RSS 2.0 + Atom).
- [x] `backend/src/refresher.mjs` con `refreshSeries`, `refreshAll`, `refreshByUser`, `startScheduler`, `stopScheduler`.
- [x] Scheduler interno con `setInterval` cada 6h + refresh al boot.
- [x] Endpoint `POST /api/refresh` (on-demand, por usuario) con `[verifyToken, getUser, resolveUserId]`.
- [x] Endpoint `POST /api/series/:id/refresh` (ownership → 404).
- [x] Manejo de errores: timeouts, 4xx/5xx del origen, XML inválido → `last_error` con mensaje útil, sin crash.
- [x] Env vars nuevas: `RSS_USER_AGENT`, `RSS_TIMEOUT` en `env_example`.
- [x] Rate limit entre fetches (800ms).

## Verificación

- [x] Serie con feed de prueba RSS → 3 items, `pendingCount = 3`, `last_error = null`.
- [x] Segundo refresco no duplica items (dedupe por guid, `inserted = 0`).
- [x] Feed 500 / 404 → `last_error` poblado, sin crash.
- [x] Serie sin `rss_url` → `{ skipped: true }`, no marca error.
- [x] `POST /api/refresh` devuelve `{ refreshed, failed, total }` y actualiza `last_checked_at`.
- [x] `POST /api/series/:id/refresh` serie ajena → 404.
- [x] Atom feed parseado (con `<id>` como guid y `<link href>`).
- [x] Item nuevo detectado entre fetches (dynamic feed).

## Cómo reproducir la verificación

- **Backend (parser + refresher + endpoints):** `cd backend && node tests/smoke-rss-engine.mjs` (levanta un mini servidor HTTP de feeds RSS/Atom de prueba + la app, y cubre todo).

## Notas de implementación

- **User-Agent default:** si `RSS_USER_AGENT` no está en env, se usa `MangaCafeRSS/1.0 (+https://github.com/mangacafe)`.
- **Timeout default:** 15s si `RSS_TIMEOUT` no está en env.
- **pub_date:** `Date.parse` para RFC822/ISO → epoch segundos. Si falla o no viene, se usa `now` (para no romper el ordenamiento).
- **guid fallback:** `<guid>` (RSS) / `<id>` (Atom) si existen, sino `link`, sino hash determinista de `title+pub_date` (prefijo `auto-`).
- **Atom links:** soporta `<link rel="alternate" href="...">` con varios `<link>` (elige el `alternate` o el primero).
- **Scheduler y tests:** `startScheduler` se llama en `index.mjs` solo bajo `if (isMain)`. Los tests importan la `app` sin que arranque el scheduler ni el `listen`.
- **`refresher.mjs`** importa `db` directamente para el `refreshAll` global (todas las series con RSS de todos los usuarios). El endpoint por usuario usa `series.listByUser(userId)` para respetar ownership.
- **Rate limit:** `sleep(800)` entre cada fetch dentro de `refreshAll`/`refreshByUser` para no ser baneado por los sitios origen.
