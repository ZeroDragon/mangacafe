# Épica 9 — Motor RSS para mangas

**Estado:** `[DONE]`
**Objetivo:** Revivir el parser RSS/Atom para que las series de **manga** se sigan por un feed, mientras el scraper de IMDB queda reservado para **anime**. El `type` de la serie determina qué feed usar.

**Depende de:** Épicas 1 (modelo `series`/`series_items`), 3 (CRUD + validación), 4 (refresher + scheduler).
**Habilita:** detección de capítulos nuevos para mangas (hoy solo funciona para anime con IMDB).

---

## Contexto / motivación

El scraper actual (Épica 4) usa exclusivamente el GraphQL de IMDB (`api.graphql.imdb.com`), que solo aplica a series televisadas/anime. Los mangas **no tienen** página de episodios en IMDB, así que el campo `imdb_url` no les sirve. Hoy el formulario ofrece el mismo campo para ambos tipos, lo que induce al usuario a pegar una URL inútil en un manga.

Históricamente existió un motor RSS genérico — `backend/src/rss.mjs` + un `refresher.mjs` basado en `xml2js` — eliminado en el commit `c2e3a69` cuando IMDB lo reemplazó (commit `88327df` es la última versión válida del parser). Ese código se **revive** aquí, acotado a los mangas. La tabla `series_items` ya es feed-agnóstica (`{ guid, title, link, pub_date, seen }`), así que RSS y IMDB alimentan el mismo historial.

### Decisión de producto (nueva — agregar a `AGENTS.md` y `PROJECT.md`)

| # | Decisión | Valor |
|---|----------|-------|
| 8 | Feed según `type` | **anime → URL de IMDB** (campo `imdb_url`); **manga → URL de RSS/Atom** (campo `rss_url`). Un campo **o** el otro según el tipo, nunca ambos. |

---

## Alcance

### 1. Modelo de datos

- Re-agregar la columna `series.rss_url TEXT` (fue renombrada a `imdb_url` en la Épica 4; ahora coexisten).
  - Bases nuevas: el `CREATE TABLE series` en `backend/src/models/db.mjs` incluye ambas columnas.
  - Bases existentes: migración idempotente `addColumnIfMissing('series', 'rss_url')` en el bloque `ready` de `db.mjs` (análoga a `renameColumnIfMissing` ya existente). **No** migrar valores: las eventuales URLs de RSS que vivían en `imdb_url` ya estaban rotas desde la Épica 4 (el scraper IMDB las rechazaba y seteaba `last_error`); el usuario las reasigna a mano en cada manga.
- `series_items` **sin cambios**: RSS y IMDB normalizan al mismo `{ guid, title, link, pub_date }`.

### 2. Parser RSS — `backend/src/rss.mjs` (revive)

Restaurar el archivo tal cual estaba en `88327df` (se puede recuperar con `git show 88327df:backend/src/rss.mjs`). Resume:
- `parseFeed(xml)` → `[{ guid, title, link, pub_date }]`, normaliza **RSS 2.0** (`rss.channel.item`) y **Atom** (`feed.entry`).
- `fallbackGuid(item)`: si no hay `<guid>`, usa `link`; si no, hash de `title|pubDate`.
- `toEpoch(raw)`: RFC822/ISO → epoch segundos; si falla, `now`.
- Exporta `parseFeed` (default), `fallbackGuid`, `toEpoch`.
- Re-agregar la dependencia **`xml2js`** a `backend/package.json`.

### 3. Refresher con dispatch por tipo — `backend/src/refresher.mjs`

- `refreshSeries(s)` ramifica según `s.type`:
  - `anime` → flujo IMDB actual (`fetchEpisodes(s.imdb_url)` + `deleteFuture` para purgar noemitidos). Sin cambios.
  - `manga` → flujo RSS revivido: `axios.get(s.rss_url)` → `parseFeed` → `seriesItem.insertMany`. **No** aplica `deleteFuture` (los feeds RSS no tienen concepto de "futuro"; todo item publicado ya exists).
  - Skipear si el campo correspondiente al tipo está vacío (`!s.imdb_url` para anime, `!s.rss_url` para manga).
- `refreshAll`: cambiar el `SELECT` a `WHERE (imdb_url IS NOT NULL AND imdb_url != '') OR (rss_url IS NOT NULL AND rss_url != '')` (cualquier serie con feed, de cualquier tipo).
- `refreshByUser`: filtrar `own` por "tiene el feed que corresponde a su tipo".
- Env vars del flujo RSS: `RSS_USER_AGENT` (UA del fetch, default razonable), `RSS_TIMEOUT` (ms, default 15000). Se suman a las `IMDB_*` ya existentes.

### 4. Validación por tipo — `backend/src/index.mjs`

`validateSeries(body, partial)` actualmente valida `imdb_url` para cualquier tipo. Cambiar a:
- `type === 'anime'`: valida `imdb_url` (http(s) URL; opcional). Si viene `rss_url` en el body → error `"rss_url is only for manga"` (o se ignora silenciosamente; **decisión: rechazar** para evitar confusiones).
- `type === 'manga'`: valida `rss_url` (http(s) URL; opcional). Si viene `imdb_url` → error `"imdb_url is only for anime"`.
- En `POST /api/series` y `PUT /api/series/:id`, el `payload`/`update` incluye el campo que corresponde al tipo (el otro se fuerza a `null`).
- `ALLOWED_FIELDS` en `series.mjs` agrega `rss_url`.

### 5. Frontend — `frontend/src/components/SeriesForm.vue`

- Reemplazar el campo único "IMDB episodes URL (optional)" por **uno condicional según `form.type`**:
  - `type === 'anime'` → input `imdb_url` con placeholder `https://www.imdb.com/title/tt.../episodes/?season=2` (igual que hoy).
  - `type === 'manga'` → input `rss_url` con placeholder `https://manga-site.com/feed`, label "RSS feed URL (optional)".
- Al toggleear el `type`, limpiar el campo del otro tipo en el `form` (que no quede basura).
- `validate()` local: validar solo el campo correspondiente al tipo, como http(s) URL.
- El prefill desde query (flujo Crunchyroll) sigue mandando `type=anime` + `imdb_url`, así que sigue funcionando sin cambios.

### 6. Dashboard / Detalle

- `GET /api/dashboard` y `GET /api/series/:id`: exponer también `rss_url` (además de `imdb_url`) para que el detalle pueda ofrecer el CTA correcto ("agregar feed IMDB" vs "agregar feed RSS").
- `SeriesDetail.vue`: el CTA de "agregar feed" / mensaje de `last_error` ya es feed-agnóstico; solo ajustar copy según el tipo si hace falta.
- El badge de pendientes, `seen`/`seen-all` y el feed cronológico funcionan igual (los items vienen de la misma tabla).

### 7. Env vars

`env_example` agrega (algunas ya mencionadas en Épica 8 pero ahora **realmente usadas**):
```
RSS_USER_AGENT "User-Agent for RSS/Atom feed fetches (e.g. MangaCafeRSS/1.0)"
RSS_TIMEOUT "ms for RSS HTTP requests (e.g. 15000)"
```

---

## Migración de datos

- `ALTER TABLE series ADD COLUMN rss_url TEXT` vía `addColumnIfMissing` (idempotente). Las bases existentes ya tienen `imdb_url`; queda como está.
- **No** hay migración de valores `imdb_url → rss_url`: desde la Épica 4 esas URLs eran inválidas para el scraper y el usuario ya las vio como error en el dashboard. Se le pide reasignar manualmente el `rss_url` en cada manga.
- Los `series_items` existentes (de animes con IMDB) se conservan intactos.

---

## Tareas

### Backend
- [x] Re-agregar dep `xml2js` a `backend/package.json` y `npm i`.
- [x] Restaurar `backend/src/rss.mjs` (desde `git show 88327df:backend/src/rss.mjs`).
- [x] `addColumnIfMissing('series', 'rss_url')` en `backend/src/models/db.mjs` (bloque `ready`); incluir `rss_url` en el `CREATE TABLE` de bases nuevas.
- [x] Agregar `rss_url` a `ALLOWED_FIELDS` y al `INSERT` de `series.create` en `backend/src/models/series.mjs`.
- [x] `refresher.mjs`: dispatch por `type` en `refreshSeries`; ampliar `SELECT` de `refreshAll`; ajustar filtro de `refreshByUser`.
- [x] `validateSeries` en `index.mjs`: reglas por tipo (rechazar el campo del tipo equivocado); forzar `null` el campo que no corresponde en POST/PUT.
- [x] Env vars `RSS_USER_AGENT` y `RSS_TIMEOUT` en `env_example`.

### Frontend
- [x] `SeriesForm.vue`: campo condicional `imdb_url`/`rss_url` según `type`; limpiar el otro al toggleear; validar solo el correspondiente.
- [x] `SeriesDetail.vue`: `.imdb-status` → `.feed-status` con `feedUrl`/`feedLabel` computeds (cambia icono y copy entre IMDB/RSS según el tipo).

### Tests
- [x] Revivir `backend/tests/smoke-rss-engine.mjs` (desde `88327df`, adaptándolo a la columna `rss_url` y al dispatch por tipo).
- [x] Cubrir dispatch: serie `manga` con `rss_url` → items insertados; serie `anime` con `imdb_url` → items IMDB (mock GraphQL); `manga` con `imdb_url` → rechazado en validación; `anime` con `rss_url` → rechazado.
- [x] Smoke existentes (`smoke-series-crud`, `smoke-imdb-engine`, `smoke-dashboard`, `smoke-series-detail`) siguen en verde tras el cambio de modelo. (`smoke-series-crud` se adaptó: OPM ahora se crea como manga con `rss_url` en vez de `imdb_url` para reflejar la nueva regla.)

## Verificación

- [x] Manga con feed RSS de prueba (mini servidor HTTP en el test) → items insertados, `pendingCount > 0`, `last_error = null`.
- [x] Segundo refresco del mismo manga no duplica items (dedupe por `guid`).
- [x] Anime con `imdb_url` (mock GraphQL) → flujo IMDB intacto, sin regresión.
- [x] `validateSeries` rechaza `rss_url` en anime y `imdb_url` en manga (400).
- [x] `refreshAll` refresca series con `imdb_url` **o** `rss_url` (mezcla de tipos).
- [x] `POST /api/series` con `type=manga` + `rss_url` persiste; el `imdb_url` queda `null`.
- [x] `POST /api/series/:id/refresh` respeta ownership (404 en serie ajena, ambos tipos).
- [x] Form muestra el campo correcto al toggleear tipo; al guardar manda solo el que corresponde.
- [x] `last_error` visible en dashboard para feeds rotos (manga con URL 404).

## Cómo reproducir la verificación

- **Backend (RSS + dispatch):** `cd backend && DB_PATH=./test.sqlite node tests/smoke-rss-engine.mjs`.
- **Regresión completa:** `cd backend && for t in smoke-auth smoke-data-model smoke-series-crud smoke-imdb-engine smoke-rss-engine smoke-dashboard smoke-series-detail; do rm -f test.sqlite && DB_PATH=./test.sqlite node tests/$t.mjs; done`.
- **Frontend:** `cd frontend && API=http://localhost:3000 BUILD_OUT_DIR=dist npm run build`.
- **Manual:** levantar dev, crear un manga con un feed RSS real (p.ej. de un sitio de scanlations), disparar refresh y ver los capítulos en el detalle.

---

## Notas de implementación (post-ejecución)

- **PUT con cambio de tipo:** el handler `PUT /api/series/:id` ahora resuelve la serie existente para conocer el `type` efectivo (del body o el actual). Si el usuario cambia de manga→anime o viceversa, se fuerza a `null` el campo del tipo anterior para mantener el dispatch limpio (no queda una serie anime con `rss_url` zombie, ni una manga con `imdb_url`).
- **`addColumnIfMissing` en `db.mjs`:** helper nuevo, análogo a `renameColumnIfMissing`. Idempotente, corre en el bloque `ready` antes del `createTable('series', ...)`. En bases nuevas la columna ya viene en el `CREATE TABLE`; en bases existentes se agrega con `ALTER TABLE series ADD COLUMN rss_url TEXT`.
- **`refreshAll` SELECT:** ahora es `WHERE (imdb_url IS NOT NULL AND imdb_url != '') OR (rss_url IS NOT NULL AND rss_url != '')`, así toma series de ambos tipos sin filtrar por usuario (eso lo hace `refreshByUser` con ownership).
- **Log del scheduler:** cambió de `[imdb]` a `[feeds]` porque ahora procesa ambos motores.
- **`smoke-series-crud` adaptado:** la Épica 3 creaba OPM como manga con `imdb_url` (válido en su momento). Bajo la nueva regla eso se rechaza, así que el smoke ahora usa `rss_url`. Verificación adicional del rechazo por tipo está cubierta en `smoke-rss-engine.mjs`.
- **`SeriesDetail.vue`:** los computeds `feedUrl`/`feedLabel` eligen el campo y el label/icono según `series.type`. La clase CSS `.imdb-status`/`.imdb-error` se renombró a `.feed-status`/`.feed-error` para que sea genérica.

---

## Notas / referencia histórica

- **Parser RSS original:** `git show 88327df:backend/src/rss.mjs` (84 líneas, `xml2js`, soporta RSS 2.0 y Atom). Restaurado sin cambios.
- **Refresher original:** `git show 88327df:backend/src/refresher.mjs` (usa `axios.get` con `responseType: 'text'` y `transformResponse: [d => d]` para no doble-parsear). El scheduler (`setInterval` 6h + `runImmediately` al boot) ya existía en el `refresher.mjs` actual; aquí se le sumó la rama manga dentro de `refreshSeries`.
- **Smoke test original:** `git show 88327df:backend/tests/smoke-rss-engine.mjs`. Se reescribió para cubrir el dispatch por tipo y la validación HTTP (POST con campo equivocado → 400).
- **Por qué coexisten dos columnas y no una genérica:** mantener `imdb_url` y `rss_url` separadas deja la semántica clara en queries, en la UI y en los errores, y evita un rename masivo. La alternativa (una columna `feed_url` + dispatch por `type`) se descarta porque rompería la migración ya hecha en Épica 4 y ensuciaría el histórico.
- **`series_items` feed-agnóstica:** clave del diseño. Tanto IMDB como RSS producen `{ guid, title, link, pub_date }`, así que dashboard, detalle, conteo de pendientes y `seen`/`seen-all` no tocan la fuente.
- **Interacción con Épica 8 (deploy):** esa épica ya menciona `RSS_USER_AGENT` y `RSS_TIMEOUT` en `env_example` y el scheduler de 6h. Con esta épica esas vars pasan a usarse de verdad; el scheduler sigue siendo el mismo (`startScheduler` en `index.mjs` bajo `if (isMain)`).
- **Crunchyroll:** el flujo de `crunchyroll/sync` + `crunchyroll/resolve` crea series de **anime** con `imdb_url`. No se ve afectado (sigue usando la rama anime del dispatch).

## Archivos modificados / creados

- `backend/src/rss.mjs` (**revive**, desde `88327df`)
- `backend/src/refresher.mjs` (dispatch por tipo en `refreshSeries`; `SELECT` de `refreshAll`)
- `backend/src/models/db.mjs` (`addColumnIfMissing` + `rss_url` en `CREATE TABLE`)
- `backend/src/models/series.mjs` (`ALLOWED_FIELDS` + `create`)
- `backend/src/index.mjs` (`validateSeries` por tipo; payload en POST/PUT; `rss_url` en dashboard)
- `backend/package.json` (re-agregar `xml2js`)
- `backend/tests/smoke-rss-engine.mjs` (**revive** + adaptación)
- `backend/tests/smoke-series-crud.mjs` (adaptado a `rss_url` para manga)
- `frontend/src/components/SeriesForm.vue` (campo condicional)
- `frontend/src/components/SeriesDetail.vue` (`.feed-status` + computeds `feedUrl`/`feedLabel`)
- `env_example` (`RSS_USER_AGENT`, `RSS_TIMEOUT`)
- `docs/AGENTS.md` y `docs/PROJECT.md` (decisión 8 en la tabla; Ya actualizados al crear la épica)
