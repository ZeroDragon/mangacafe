# Épica 12 — Auto-detección de fuente (RSS vs HTML scrapeado) para mangas

**Estado:** `[DONE]`
**Objetivo:** Que el campo `rss_url` de un manga acepte **tanto un feed RSS/Atom como la URL de una página de series** (HTML). El refresher detecta automáticamente cuál de los dos es y ramifica el flujo: feed → parser RSS existente; HTML → scraper del proveedor correspondiente. Primer proveedor: **comivex.com**. La arquitectura queda preparada para sumar scrapers de otros sitios en el futuro sin tocar el refresher.

**Depende de:** Épica 9 (motor RSS + dispatch por `type`), Épica 4 (`refresher.mjs` + scheduler).
**Habilita:** dejar de depender de servicios intermedios caros/no confiables (rss.app), scrapear directo desde el sitio origen, y sumar nuevos proveedores de manga con un adapter mínimo.

---

## Contexto / motivación

Hoy (Épica 9) un manga se sigue por un feed RSS/Atom pegado en `series.rss_url`. En la práctica el usuario usa **rss.app** para generar ese feed a partir de un sitio que no ofrece RSS nativo (típicamente comivex.com). Eso funciona, pero:

- **rss.app es pago y caro** para el volumen que Manga Café necesita.
- **El CDN de rss.app cachea agresivamente** y sirve contenido stale a ciertas regiones: el usuario corrige el feed en rss.app pero el backend sigue recibiendo la versión vieja aunque se dispare un refresh manual (verificado: el backend no tiene cache/debounce, el problema es upstream).
- **El usuario pierde control**: rss.app decide qué items incluir y en qué formato, sin que el usuario pueda corregirlo.

Hicimos un experimento (`experiments/comivex-scraper/scrape.mjs`, con `axios` + `cheerio`) que scrapea `https://comivex.com/series/1295-…/` y devuelve los 81 capítulos declarados en formato compatible con `series_items` (`{ guid, title, link, pub_date }`). Funciona.

Esta épica **promueve ese experimento a producción** (y luego lo borra — el adapter en `backend/src/sources/comivex.mjs` pasa a ser el vivo) y define el patrón de "fuente" (source) con auto-detección, para que sumar otro proveedor en el futuro sea un fork chico del flujo y no un rewrite. **Fuera de alcance de esta épica:** cualquier enriquecimiento de metadata de la serie (cover, autor, géneros, synopsis). El usuario carga lo que quiera manualmente; el scraper sólo produce items (capítulos).

### Decisión de producto (nueva — agregar a `AGENTS.md` y `PROJECT.md`)

| # | Decisión | Valor |
|---|----------|-------|
| 11 | `rss_url` ahora acepta RSS **o** HTML | El campo `series.rss_url` de un manga admite (a) un feed RSS/Atom o (b) la URL de la página de la serie en un sitio soportado (comivex.com al iniciar). El refresher detecta el tipo automáticamente y rutea al parser o al scraper del proveedor. **No** se agrega una columna nueva: la detección es por contenido/host, no por un flag en la DB (Épica 12). |

---

## Alcance

### 1. Módulo de fuentes — nuevo — `backend/src/sources/`

Directorio nuevo que centraliza todo lo relacionado con obtener items para un manga. El refresher deja de saber cómo se fetchear y solo llama `sources.fetchItems(url)`.

```
backend/src/sources/
├── index.mjs          # orquestador: detecta + dispatcha
├── rss.mjs            # wrapper sobre el parser RSS existente
└── comivex.mjs        # adapter de comivex.com (port del experimento)
```

#### 1a. Orquestador — `backend/src/sources/index.mjs`

```js
// fetchItems(url) → { items: [{ guid, title, link, pub_date }] }
//
// 1. Pre-route por host: si url.host matchea un adapter registrado (COMIVEX_HOSTS),
//    usa ese adapter (hace su propio GET).
// 2. Sino: GET propio, sniff del body, rutea a RSS o al adapter del host si lo hay.
// 3. Sino se reconoce → error "unsupported source".
export const fetchItems = async (url) => { ... }
```

**Algoritmo de detección** (`detectSource({ url, contentType, body })`):

1. **Host conocido** (`comivex.com`, `www.comivex.com`) → `comivex` adapter. **Decisión a favor de host-routing primero**: es determinístico, no requiere fetch para decidir, y los adapters típicamente hacen su propio GET con headers específicos (UA de browser, etc.) que difieren del GET "plano" que sirve para sniffear un RSS.
2. **Sino**, fetch (GET con UA genérico, `responseType: 'text'`, `transformResponse: [d => d]` — igual que el flujo RSS actual) y sniff:
   - `Content-Type` incluye `rss+xml` / `atom+xml` / `xml` → `rss`.
   - El body (primeros 2 KB, sin contar BOM/whitespace inicial) arranca con `<?xml` **o** contiene `<rss` / `<feed` / `<rdf:RDF` → `rss` (algunos feeds vienen con `Content-Type: text/plain` por server mal configurado; el sniff los rescata).
   - El body contiene `<html` o `<!DOCTYPE html>` → es HTML. Si el host matchea un adapter registrado → ese adapter (ya tiene el body, lo reutiliza). Sino → error `"HTML page from unknown host '<host>' — no adapter available"`.
3. **Default**: si nada matchea, intentar `rss` (backward compat con feeds raros que ya están en la DB).

El orquestador **no** knows about `series` ni `series_items`: solo produce `{ items }`. El refresher hace el `insertMany`.

#### 1b. Adapter RSS — `backend/src/sources/rss.mjs`

Wrapper delgado sobre `parseFeed` (que sigue en `backend/src/rss.mjs` — **no** se mueve para no romper imports existentes). Recibe `{ body }` ya fetcheado y devuelve `{ items }`.

#### 1c. Adapter Comivex — `backend/src/sources/comivex.mjs`

Port de `experiments/comivex-scraper/scrape.mjs` al árbol de backend. Exporta:

```js
export const COMIVEX_ADAPTER = {
  name: 'comivex',
  hosts: ['comivex.com', 'www.comivex.com'],
  // el adapter hace su propio GET con UA de browser realista (cloudflare en el medio)
  async fetch(url) {
    const { data } = await axios.get(url, { headers: { 'User-Agent': COMIVEX_UA, ... }, responseType: 'text', transformResponse: [d => d] })
    return parseComivexHTML(data, url)
  },
  // para el caso en que el orquestador ya fetcheó (cuando cae por la rama "HTML sniff")
  parse(body, url) { return parseComivexHTML(body, url) }
}

// Devuelve { items }
function parseComivexHTML(html, url) {
  const $ = cheerio.load(html)
  const items = []
  $('.ch-item').each((_, el) => {
    const $el = $(el)
    const numText = $el.find('.ch-num').text().trim()         // "Chapter 75"
    const chapterNumber = numText.replace(/^Chapter\s+/i, '')
    const href = $el.find('.ch-link').attr('href')
    const ageText = $el.find('.ch-date').text().trim()        // "1 week, 2 days ago"
    items.push({
      guid: `comivex:${mangaId}:${chapterNumber}`,            // estable y único
      title: numText,
      link: href.startsWith('http') ? href : `${BASE}${href}`,
      pub_date: parseAgeToEpoch(ageText)                       // aprox 1y=365d, 1mo=30d, 1w=7d
    })
  })
  return { items }
}
```

**Guids estables**: el formato `comivex:{mangaId}:{chapterNumber}` es determinístico y no cambia entre runs (a diferencia de los md5 random de rss.app), así que el dedupe por `(series_id, guid)` funciona perfecto. `mangaId` se extrae del botón "Start Reading" (`/read/1295/…`).

**Dependencias nuevas**: `cheerio` (verificar si ya está en el repo; si no, agregarlo a `backend/package.json`). `axios` ya está.

### 2. Refresher — `backend/src/refresher.mjs`

`refreshManga(s)` se simplifica: delega al orquestador.

```js
// antes (Épica 9):
const res = await axios.get(s.rss_url, { ... })
const items = await parseFeed(res.data)
const { inserted } = await seriesItem.insertMany(s.id, items)

// después (Épica 12):
const { items } = await sources.fetchItems(s.rss_url)
const { inserted } = await seriesItem.insertMany(s.id, items)
```

- `refreshSeries(s)` sigue ramificando por `type` (anime → IMDB, manga → sources). **Sin cambios** en el dispatch por tipo — solo cambia la implementación interna de la rama manga.
- `refreshAll` y `refreshByUser` **sin cambios**: la query `WHERE rss_url IS NOT NULL` ya trae cualquier manga con URL, sea RSS o HTML.
- El handler de errores (setear `last_error` en fallo, no reventar al caller) se mantiene idéntico.

### 3. Validación — `backend/src/index.mjs`

- `validateSeries` para `type === 'manga'` sigue validando `rss_url` como http(s) URL. **No** se valida el host (no queremos prohibir hosts que no tengan adapter — el usuario puede cargar una URL de un sitio que after-the-fact se le agregue adapter; el error se manifiesta en `last_error` al primer refresh).
- **Nuevo**: si el refresh falla con "unsupported source / no adapter", ese mensaje llega a `last_error` y se ve en el dashboard igual que cualquier error de feed (Épica 9, decisión 7).

### 4. Frontend

Mínimo. **No** hay flujo nuevo, solo copy:

- `SeriesForm.vue`: el label del campo para manga pasa de "RSS feed URL (optional)" a **"Feed URL or series page (optional)"**; placeholder pasa a mostrar un ejemplo mixto: `https://site.com/feed.xml` o `https://comivex.com/series/…`.
- `SeriesDetail.vue`: el computed `feedLabel` hoy muestra "RSS" para mangas. Mantener (el usuario no necesita saber si vino de RSS o scrapeo; el indicador `last_read` funciona igual porque `series_items` es feed-agnóstica).

### 5. Env vars — `env_example`

```
COMIVEX_USER_AGENT "User-Agent for scraping comivex.com (realistic browser UA)"
COMIVEX_TIMEOUT "ms for comivex HTTP requests (e.g. 15000)"
```

`RSS_USER_AGENT` y `RSS_TIMEOUT` ya existen (Épica 9) — siguen usándose para el adapter RSS.

---

## Migración de datos

- **Columna `rss_url`**: sin cambios (sigue siendo `TEXT`, ya existe desde Épica 9).
- **Sin nuevas columnas en `series`** (el enriquecimiento de metadata queda fuera de alcance — el usuario decide qué guardar a mano).
- Los `series_items` existentes (de mangas con feed RSS) se conservan intactos. Los guids viejos (`b6dd0fec…` de rss.app) y los nuevos (`comivex:1295:75`) coexisten sin colisionar — el usuario puede seguir con el feed RSS o pasar a la URL de comivex, en cuyo caso los items nuevos se agregan (no se duplican: distintos guids).

---

## Tareas

### Backend
- [x] `backend/package.json`: verificar/agregar `cheerio`.
- [x] `backend/src/sources/index.mjs` (nuevo): `fetchItems(url)` + `detectSource({ url, contentType, body })` con el algoritmo de 3 pasos.
- [x] `backend/src/sources/rss.mjs` (nuevo): wrapper sobre `parseFeed`.
- [x] `backend/src/sources/comivex.mjs` (nuevo): port de `experiments/comivex-scraper/scrape.mjs`; helpers `parseAgeToEpoch`, `parseComivexHTML`, exports `COMIVEX_ADAPTER`.
- [x] `backend/src/refresher.mjs`: `refreshManga` delega a `sources.fetchItems`.
- [x] `env_example`: `COMIVEX_USER_AGENT`, `COMIVEX_TIMEOUT`.
- [x] Borrar `experiments/comivex-scraper/` completo (script + `node_modules` + `package.json` + `package-lock.json`) una vez portado a `backend/src/sources/comivex.mjs` y verificado.

### Frontend
- [x] `frontend/src/components/SeriesForm.vue`: label/placeholder del campo `rss_url` ("Feed URL or series page").

### Tests
- [x] `backend/tests/smoke-sources.mjs` (nuevo):
  - `detectSource`: cubre RSS por Content-Type, RSS por sniff (`<rss>` sin content-type correcto), Atom (`<feed>`), HTML (`<html>`), host conocido (`comivex.com` → adapter), host desconocido con HTML → error.
  - `fetchItems('https://comivex.com/series/1295-…/')`: prueba en vivo (o mock con fixture HTML commiteado en `tests/fixtures/comivex-1295.html`) → valida items con `guid` `comivex:1295:N`, `link` absoluto, `pub_date` no null.
  - Adapter RSS: reusa el mini-servidor HTTP del `smoke-rss-engine.mjs` actual; verifica que el wrapper produce el mismo output que `parseFeed`.
  - Host desconocido con HTML → lanza error claro (`unsupported source`).
- [x] `backend/tests/smoke-rss-engine.mjs`: ampliar para verificar que el dispatch final sigue siendo por `type` y que un manga con URL `comivex.com` rutea al scraper (mockeando `sources.comivex.fetch`).
- [x] Smoke existentes (`smoke-series-crud`, `smoke-dashboard`, `smoke-series-detail`) siguen en verde.

## Verificación

- [x] Manga creado con URL de **feed RSS real** → refresh inserta items como antes (sin regresión, el adapter RSS es la ruta).
- [x] Manga creado con URL de **comivex.com/series/…** → refresh inserta todos los capítulos declarados (81/81 en el caso de prueba), con guids `comivex:{id}:{num}` estables.
- [x] Segundo refresh del mismo manga no duplica items (dedupe por `guid`).
- [x] Manga creado con URL de un host no soportado (p.ej. `https://example.com/manga/x`) → `last_error` con mensaje claro; no rompe el scheduler ni el refresh de otras series.
- [x] Manga con feed RSS que viene con `Content-Type: text/plain` (server mal configurado) → sigue funcionando por sniff de `<rss>`.
- [x] `refreshAll` (scheduler) procesa mezcla de mangas con RSS y con URL de comivex sin errores.
- [x] Anime con `imdb_url` sigue funcionando intacto (regresión Épica 9).
- [x] `experiments/comivex-scraper/` fue borrado del repo (su lógica vive en `backend/src/sources/comivex.mjs`).

## Cómo reproducir la verificación

- **Sources:** `cd backend && DB_PATH=./test.sqlite node tests/smoke-sources.mjs`.
- **Regresión dispatch por tipo:** `cd backend && DB_PATH=./test.sqlite node tests/smoke-rss-engine.mjs`.
- **Regresión completa:** `cd backend && for t in smoke-auth smoke-data-model smoke-series-crud smoke-imdb-engine smoke-rss-engine smoke-sources smoke-dashboard smoke-series-detail; do rm -f test.sqlite && DB_PATH=./test.sqlite node tests/$t.mjs; done`.
- **Manual:** levantar dev, crear un manga pegando `https://comivex.com/series/1295-shinmai-ossan-bouven-sha-…/` en el campo de feed, disparar refresh, ver los 81 capítulos en el detalle.

---

## Alternativas consideradas

- **Agregar una columna `source_type` en `series` (`'rss' | 'comivex' | …`) para explicitar la fuente.** Descartado: obliga al usuario a saber y elegir, y cualquier cambio de provider requiere migración/manual override. La detección automática por host + sniff es más robusta y transparente.
- **Renombrar `rss_url` a `feed_url` para reflejar que ahora admite HTML.** Descartado por la misma razón que Épica 9 descartó la columna genérica: rompe la migración ya hecha, ensucia el histórico, y semánticamente "rss_url" sigue siendo el feed del manga (la URL de donde sale su feed, sea XML o HTML scrapeado). El nombre es un alias mental claro.
- **Scrapear comivex sin cheerio, con regex puro.** Descartado: el HTML tiene clases predecibles (`ch-item`, `ch-num`, `ch-date`) pero frágiles ante un rediseño. `cheerio` da selectores CSS legibles y triviales de mantener; el costo de la dep es despreciable.
- **Adapters como objetos dinámicos (autoload de `sources/*.mjs`).** Descartado por ahora: con 1 adapter no se justifica la indirección. Un `index.mjs` con un array explícito `ADAPTERS = [COMIVEX_ADAPTER]` + lookup por host es trivial de extender (sumar un elemento al array) y mucho más fácil de debuggear. Cuando haya 3+ adapters se puede reconsiderar.
- **Mantener rss.app como fuente y sólo agregar comivex como alternativa.** Descartado por el problema que motivó esta épica: rss.app es caro y cachea stale. Scrapear directo del origen es superior.
- **No hacer detección y exigir al usuario marcar el tipo de fuente en el form.** Descartado: la detección por host + sniff es lo suficientemente confiable para los casos reales, y le ahorra al usuario una decisión que no debería tener que tomar.
- **Auto-enriquecer metadata de la serie (cover, autor, géneros, synopsis) desde el HTML scrapeado.** Descartado: el usuario prefiere decidir manualmente qué metadata guardar. El scraper queda acotado a producir items (capítulos); la metadata de la serie sigue siendo responsabilidad del usuario vía el form existente.

---

## Notas / referencia histórica

- **Experimento previo:** `experiments/comivex-scraper/scrape.mjs` (este repo) — prueba de concepto con `axios` + `cheerio` que scrapea `comivex.com/series/1295-…` y devuelve 81/81 capítulos. Es la base directa del adapter `comivex.mjs` de esta épica. **Se borra** del repo una vez portado y verificado en el backend (tarea explícita de la épica) — su razón de ser era validar la viabilidad del scrapeo, cosa lograda; el adapter en producción es el vivo.
- **Motivación concreta:** el feed `https://rss.app/feeds/c7fGZRJ81Lo2uwqm.xml` (un manga de comivex) traía 1 solo item aunque el usuario lo corrigió en rss.app para traer 25. Investigación: el backend de Manga Café **no** tiene cache/debounce/TTL — siempre hace GET fresco. El problema era el CDN de rss.app sirviendo stale al backend (mientras servía fresh a otros clientes). Conclusión: eliminar el intermediario.
- **Cloudflare en comivex:** el HTML incluye `cf-beacon` y headers de CF. Con un UA realista de browser no hubo bloqueo en el experimento. Si a futuro lo bloquean, opciones: rotar UA, sumar retry/backoff, o usar un header `Accept-Language` (ya planeado). No es bloqueante hoy.
- **`parseAgeToEpoch`:** las fechas de comivex vienen como texto relativo (`"1 week, 2 days ago"`, `"5 years, 5 months ago"`). La función las convierte a epoch con aproximaciones estándar (1y=365d, 1mo=30d, 1w=7d). Suficiente para ordenamiento cronológico en `series_items`; no son timestamps exactos pero el sistema no las necesita (el dedupe es por `guid`, no por fecha).
- **Coexistencia con items viejos:** si un manga venía de rss.app con guids md5 (`b6dd0fec…`) y se migra a URL de comivex, los items viejos **no se borran** — siguen en `series_items` con su `seen` actual. Los nuevos (con guids `comivex:1295:N`) se agregan al lado. El usuario ve el feed mezclado pero ordenado por `pub_date`. Opcional: un endpoint/script de "purgar items de un source previo" si se vuelve molesto — **fuera de alcance** de esta épica.

---

## Archivos a modificar / crear

- `backend/src/sources/index.mjs` (**nuevo**, orquestador + `detectSource`).
- `backend/src/sources/rss.mjs` (**nuevo**, wrapper sobre `parseFeed`).
- `backend/src/sources/comivex.mjs` (**nuevo**, port del experimento).
- `backend/src/refresher.mjs` (`refreshManga` delega a `sources.fetchItems`).
- `backend/package.json` (verificar/agregar `cheerio`).
- `backend/tests/smoke-sources.mjs` (**nuevo**).
- `backend/tests/smoke-rss-engine.mjs` (ampliar: dispatch manga→sources, caso comivex).
- `backend/tests/fixtures/comivex-1295.html` (**nuevo**, snapshot HTML para tests offline).
- `frontend/src/components/SeriesForm.vue` (label/placeholder del campo `rss_url`).
- `experiments/comivex-scraper/` (**borrar** completo una vez portado).
- `env_example` (`COMIVEX_USER_AGENT`, `COMIVEX_TIMEOUT`).
- `docs/AGENTS.md` y `docs/PROJECT.md` (decisión 11 + fila en la tabla de épicas).
