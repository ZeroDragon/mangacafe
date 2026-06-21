# Épica 4 — Scraper de IMDB

**Estado:** `[DONE]`
**Objetivo:** Refrescar los episodios de las series desde IMDB (en lugar de un feed RSS genérico), deduplicar items y mantener actualizado el conteo de pendientes y los errores visibles.

**Depende de:** Épica 1 (tablas `series` + `series_items`).
**Habilita:** Épicas 5, 6 (necesitan los items para mostrar).

---

## Alcance

### Por qué GraphQL y no HTML scraping
La URL pública `https://www.imdb.com/title/ttXXXX/episodes/?season=N` está detrás de **AWS WAF** (reto de JavaScript), por lo que un `GET` con `axios` recibe un `202` con un challenge. En cambio, el **endpoint GraphQL interno** que usa la propia web de IMDB (`https://api.graphql.imdb.com/`) es accesible directamente y devuelve los episodios de forma estructurada y estable, sin depender de selectores CSS frágiles. Es lo que se usa aquí.

### Parser/cliente — `backend/src/imdb.mjs`
- `parseImdbUrl(url)` → `{ ttId, season }`. Acepta `…/title/ttXXXXXXX/episodes/?season=N` (default `season=1` si no viene).
- `fetchEpisodes(imdbUrl, opts)` → `{ items, total, ttId, season }` donde cada item es `{ guid, title, link, pub_date }`.
  - `guid` = `ttId` del episodio (único global en IMDB → dedupe perfecto).
  - `title` = `S{season} E{n}: {titulo}`.
  - `link` = `canonicalUrl` del episodio en IMDB.
  - `pub_date` = epoch (UTC 00:00) de la fecha de emisión.
  - **Filtra** episodios sin fecha de emisión o con fecha futura: no deben contarse como pendientes hasta que se emitan.

### Refresco de una serie (`refreshSeries(series)`)
1. Si `imdb_url` es NULL/empty → `{ skipped: true }`.
2. `fetchEpisodes(imdb_url)` con `User-Agent` configurable (`IMDB_USER_AGENT`) y timeout (`IMDB_TIMEOUT`).
3. `series_item.insertMany` (dedupe por `UNIQUE(series_id, guid)`).
4. Actualiza `last_known_total`, `last_checked_at = now`, `last_error = NULL`.
5. En fallo (URL no-IMDB, ttId inexistente, error GraphQL/HTTP): `last_error = mensaje`, sin romper el job.

### Scheduler
- **`setInterval` interno** cada 6h (decisión 5) + refresh al boot (`runImmediately`). Arranca solo cuando `index.mjs` se ejecuta directamente (`if (isMain)`), no en tests.
- Delay de 800ms entre fetches (rate-limit suave).
- `setInterval.unref()` para no mantener vivo el proceso solo por el interval.

### Endpoints on-demand (dev / UX)
- `POST /api/refresh` — refresca las series del usuario actual.
- `POST /api/series/:id/refresh` — refresca una sola serie (ownership → 404).

---

## Migración de datos (RSS → IMDB)
- La columna `series.rss_url` se renombra a `series.imdb_url` vía `ALTER TABLE … RENAME COLUMN` (SQLite ≥ 3.25), de forma idempotente en `backend/src/models/db.mjs` (`renameColumnIfMissing`). Las bases nuevas se crean directamente con `imdb_url`.
- Los valores existentes de `rss_url` (URLs de feeds RSS) dejarán de funcionar: el usuario debe reemplazarlos por URLs de episodios de IMDB. Los items `series_items` previos se conservan (siguen siendo pendientes/vistos).

## Tareas

- [x] `backend/src/imdb.mjs` con `parseImdbUrl` y `fetchEpisodes` (GraphQL a `api.graphql.imdb.com`).
- [x] `backend/src/refresher.mjs` con `refreshSeries`, `refreshAll`, `refreshByUser`, `startScheduler`, `stopScheduler` (usando `imdb.mjs`).
- [x] Scheduler interno con `setInterval` cada 6h + refresh al boot.
- [x] Endpoint `POST /api/refresh` (on-demand, por usuario) con `[verifyToken, getUser, resolveUserId]`.
- [x] Endpoint `POST /api/series/:id/refresh` (ownership → 404).
- [x] Manejo de errores: timeouts, 4xx/5xx del origen, URL no-IMDB, errores GraphQL → `last_error` con mensaje útil, sin crash.
- [x] Filtrado de episodios no emitidos (sin fecha o fecha futura).
- [x] Env vars: `IMDB_USER_AGENT`, `IMDB_TIMEOUT`, `IMDB_GRAPHQL_ENDPOINT` en `env_example`.
- [x] Migración `series.rss_url` → `series.imdb_url`.
- [x] Dep `xml2js` eliminada (ya no se parsea XML).

## Verificación

- [x] Serie con URL IMDB de prueba (mock GraphQL) → 3 items, `pendingCount = 3`, `last_error = null`.
- [x] Segundo refresco no duplica items (dedupe por `guid` = ttId, `inserted = 0`).
- [x] GraphQL 500 / URL no-IMDB / GraphQL errors → `last_error` poblado, sin crash.
- [x] Episodios futuros y sin fecha son filtrados (no aparecen como pendientes).
- [x] Serie sin `imdb_url` → `{ skipped: true }`, no marca error.
- [x] `POST /api/refresh` devuelve `{ refreshed, failed, total }` y actualiza `last_checked_at`.
- [x] `POST /api/series/:id/refresh` serie ajena → 404.

## Cómo reproducir la verificación

- **Backend (parser + refresher + endpoints):** `cd backend && node tests/smoke-imdb-engine.mjs` (levanta un mini servidor HTTP que simula `api.graphql.imdb.com` + la app, y cubre todo).

## Notas de implementación

- **Endpoint default:** `https://api.graphql.imdb.com/`. Sobreescribible con `IMDB_GRAPHQL_ENDPOINT` (útil para tests y para apuntar a otro origen).
- **User-Agent default:** si `IMDB_USER_AGENT` no está en env, se usa un UA de navegador de escritorio (el GraphQL rechaza algunos UAs muy simples).
- **Timeout default:** 15s si `IMDB_TIMEOUT` no está en env.
- **Query GraphQL:** `title(id).episodes.episodes(first:200, filter:{includeSeasons:[season]})` → `edges[].{position, node}`. El `node` es un `Title` (cada episodio es un título en IMDB); `position` es el nº de episodio en la temporada.
- **Scheduler y tests:** `startScheduler` se llama en `index.mjs` solo bajo `if (isMain)`. Los tests importan la `app` sin que arranque el scheduler ni el `listen`.
- **`refresher.mjs`** importa `db` directamente para el `refreshAll` global (todas las series con `imdb_url` de todos los usuarios). El endpoint por usuario usa `series.listByUser(userId)` para respetar ownership.
- **Rate limit:** `sleep(800)` entre cada fetch dentro de `refreshAll`/`refreshByUser` para no ser baneado por IMDB.
- **Aviso legal:** el endpoint GraphQL devuelve un `disclaimer` que prohíbe uso comercial/público de los datos. Este proyecto es de uso personal/no comercial.
