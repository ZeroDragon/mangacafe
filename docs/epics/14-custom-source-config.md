# Épica 14 — Scraping genérico con config de usuario para graphic novels

**Estado:** `[DONE]`
**Objetivo:** Que cualquier sitio de graphic novels (sin RSS confiable y sin adapter dedicado) pueda scrapearse **sin escribir código nuevo por dominio**. El usuario provee desde el form cuatro campos simples —**selector CSS**, **atributo URL**, **atributo label**, **reverse**— en vez de un query JS. El backend fetchea el HTML, lo parsea con `cheerio` (ya instalado — mismo motor que el adapter comivex), aplica el selector + extrae los atributos + opcionalmente invierte el orden, y normaliza el resultado a `series_items`. El adapter de **comivex** (Épica 12) queda intacto y sigue sirviendo para su dominio; este approach es la **ruta genérica** para todo el resto.

**Depende de:** Épica 12 (orquestador `sources/index.mjs` + adapter comivex), Épica 9 (columna `rss_url`).
**Habilita:** trackear cualquier manga/webcomic/manhwa de cualquier sitio sin tocar el backend — el usuario resuelve el scraping llenando 3 campos + 1 toggle.

---

## Contexto / motivación

Cada sitio de manga es estructuralmente distinto: distintos selectores, distinto markup, algunos listan los capítulos en una `<table>`, otros en `<ul>`, otros en cards con clases específicas. Hoy (post-Épica 12) sólo tenemos dos rutas: **RSS** (para sitios con feed nativo) y **comivex** (adapter dedicado con `cheerio` para ese dominio). Sumar un segundo sitio requeriría escribir un `sources/<host>.mjs` nuevo — costo que no escala.

El insight: el usuario ya sabe navegar el sitio objetivo y, con DevTools, puede identificar en segundos **qué selector CSS** corresponde a los links de capítulos, y de esos links, **qué atributo** es la URL y **qué atributo** (o `text`) es el label. No necesita escribir JS: sólo tres valores + un toggle de orden. El backend arma el `.map()` con esos parámetros. **Un solo scraper genérico + config del usuario = cobertura de cualquier sitio**, sin que el backend conozca el markup de antemano, **sin dependencias nuevas**, y **sin ejecutar JS arbitrario del usuario** (más seguro, más simple).

### Caso de prueba (referencia)

- **URL:** `https://w18.witchhatatelier.com/`
- **Selector:** `table tr td a`
- **URL attr:** `href`
- **Label attr:** `text`
- **Reverse:** `true` (el sitio lista Chapter 97 primero, Chapter 1 último → invertir para normalizar a oldest-first)
- **Resultado esperado:** **112 elementos** `{url, label}` (Chapter 1 → Chapter 97, con sub-letras 5e, 23e, 35f, etc.). Cada `url` es absoluta en este sitio; cada `label` es el texto visible del link (`"Witch Hat Atelier, Chapter 97"`). Verificado en vivo con `cheerio@1.2.0` para el selector + attrs (el array crudo son 112 items en orden newest-first; con `reverse: true` queda oldest-first — ese es el orden interno que `normalizeItems` usa para asignar `pub_date` ascendente). **En el UI**, el botón Preview y el feed del detalle muestran el orden opuesto (newest-first, Chapter 97 arriba) porque `series_items` ordena por `pub_date DESC`.

### Decisión de producto (nueva — agregar a `AGENTS.md` y `PROJECT.md`)

| # | Decisión | Valor |
|---|----------|-------|
| 13 | `source_config` para scraping genérico | Una serie `manga` puede llevar además un **`source_config`** (JSON, nullable) con `{ selector, url_attr, label_attr, reverse }` que describe cómo extraer los capítulos del HTML del sitio referenciado por `rss_url`. Si está presente, el refresher fetchea el HTML, lo parsea con `cheerio` (sin dependencias nuevas — ya instalado), ejecuta el selector + extrae los atributos + opcionalmente invierte el orden, y normaliza a `series_items`. Si está ausente, el flujo es el de Épica 12 (detección por host → comivex, o sniff → RSS). **El adapter comivex no se rompe**: una URL de comivex sin `source_config` sigue usando su adapter dedicado; una URL de comivex **con** `source_config` usa el genérico (decisión explícita del usuario) (Épica 14). |

---

## Alcance

### 1. Adapter custom — nuevo — `backend/src/sources/custom.mjs`

Núcleo de la épica. Recibe `{ url, config }`, produce `{ items: [{ guid, title, link, pub_date }] }`.

**Pipeline:**

```
fetch HTML (axios, UA de browser)
    ↓
parsear con cheerio.load(html) → $
    ↓
aplicar selector: $(selector) → colección de elementos
    ↓
extraer para cada elemento: { url: attr(url_attr) o text(), label: attr(label_attr) o text() }
    ↓
si reverse: invertir el array
    ↓
validar resultado (no vacío, URLs presentes)
    ↓
normalizar a series_items (guid estable, resolver URLs relativas, pub_date ascendente por índice)
```

**`config` shape:**

```js
{
  selector: 'table tr td a',   // selector CSS requerido
  url_attr:   'href',          // atributo del elemento cuyo valor es la URL (default: 'href')
  label_attr: 'text',          // atributo del elemento cuyo valor es el label (default: 'text' → $(el).text())
  reverse:    true             // invertir el array después de extraer (default: false)
}
```

**Exports:**

```js
// Ejecuta el pipeline completo (fetch + cheerio + extract + normalize).
// Usado por el refresher vía sources.fetchItems(url, { config }).
async function fetch(url, config) { ... }

// Ejecuta la extracción contra un body ya fetcheado (reuso del orquestador).
// Usado cuando el orquestador ya tiene el HTML (rama sniff).
function parse(body, url, config) { ... }

// Ejecuta solo el extract, sin persistir. Devuelve los items "crudos"
// {url,label} para preview. Usado por POST /api/sources/preview.
async function preview(url, config) {
  const html = await fetchHTML(url)
  const raw = extractItems(html, url, config)   // [{url,label}]
  return { items: raw, count: raw.length }       // sin normalizar (el front muestra tal cual)
}

export const CUSTOM_ADAPTER = { name: 'custom', fetch, parse, preview }
```

#### 1a. Fetch del HTML

Idéntico al adapter comivex: `axios.get` con `responseType: 'text'`, `transformResponse: [d => d]` (no doble-parsear), UA de browser realista + `Accept-Language`. Env vars `CUSTOM_SOURCE_USER_AGENT` / `CUSTOM_SOURCE_TIMEOUT`.

#### 1b. Extracción con cheerio

```js
import * as cheerio from 'cheerio'

// extrae [{url,label}] a partir del HTML y la config.
function extractItems (html, baseUrl, config) {
  const { selector, url_attr = 'href', label_attr = 'text', reverse = false } = config
  const $ = cheerio.load(html)

  const raw = $(selector).map((i, el) => {
    const url   = readAttr($, el, url_attr)
    const label = readAttr($, el, label_attr)
    return { url, label }
  }).get()                         // .get() convierte el cheerio array a array nativo

  return reverse ? raw.reverse() : raw
}

// Lee un "attr" de un elemento. Casos:
//   'text'        → $(el).text() (contenido de texto)
//   'html'        → $(el).html() (contenido HTML, útil si el label tiene marcado)
//   cualquier otra string → $(el).attr(name) (atributo del tag: href, src, data-x, title, ...)
function readAttr ($, el, name) {
  if (name === 'text') return $(el).text().trim()
  if (name === 'html') return $(el).html()
  return $(el).attr(name) || ''
}
```

Por qué `cheerio` y no `jsdom`: `cheerio` **ya está instalado** (lo usa `backend/src/sources/comivex.mjs` desde la Épica 12) — cero dependencias nuevas. Es ~50x más rápido y liviano que `jsdom` (que pesa ~10MB y arrastra `htmlparser2`, `tough-cookie`, etc.). Como el usuario ahora provee **selector + nombres de atributo** (no JS arbitrario), no necesitamos un DOM real — `cheerio` basta.

Por qué esto y no un query JS: tres campos simples son **mucho más fáciles de llenar** que un query JavaScript. El usuario no necesita saber programar, sólo leer DevTools. Y el backend no ejecuta JS del usuario (sin `vm`, sin sandbox, sin riesgo de código malicioso).

#### 1c. Normalización a `series_items`

El extract devuelve `[{ url, label }]` (ya con reverse aplicado). Se normaliza al formato que `seriesItem.insertMany` espera:

```js
import crypto from 'node:crypto'

function normalizeItems (raw, baseUrl) {
  if (!Array.isArray(raw)) throw new Error('extractItems must return an array')
  if (raw.length && (!raw[0] || typeof raw[0] !== 'object')) {
    throw new Error('extractItems items must be objects {url, label}')
  }
  const base = Math.floor(Date.now() / 1000)
  return raw.map((item, i) => {
    if (typeof item.url !== 'string' || !item.url) {
      throw new Error('each item must have a string "url"')
    }
    // Resolver URLs relativas contra la URL del sitio (cheerio NO resuelve href;
    // attr('href') devuelve el valor crudo). Si ya es absoluta, new URL la deja igual.
    let link
    try { link = new URL(item.url, baseUrl).href } catch { link = item.url }
    return {
      guid: `custom:${crypto.createHash('sha256').update(link).digest('hex').slice(0, 16)}`,
      title: String(item.label ?? link),
      link,
      pub_date: base + i            // result[0] = más viejo; ver nota abajo
    }
  })
}
```

**Guids estables:** `custom:{sha256(link)[:16]}`. Determinístico y único por URL — el dedupe por `(series_id, guid)` funciona entre runs (igual que `comivex:{mangaId}:{chapterNumber}`). Si el sitio cambia la URL de un capítulo, el guid cambia y el item se re-inserta como nuevo; el usuario lo marca visto a mano. El hash se calcula sobre el `link` ya resuelto (absoluto) para que `/manga/x` y `https://site.com/manga/x` no produzcan guids distintos.

**Resolución de URLs relativas:** `cheerio` devuelve el atributo `href` crudo (`$(el).attr('href')`) — NO resuelve a URL absoluta como lo haría la propiedad `.href` de un DOM real. `normalizeItems` resuelve cada URL relativa contra `baseUrl` con `new URL(item.url, baseUrl).href`. Si el sitio ya usa URLs absolutas (como witchhatatelier), `new URL` las deja intactas. El usuario no tiene que preocuparse por resolver URLs.

**`pub_date` ascendente por índice:** los items del adapter custom no tienen fecha real (la config `{selector, attrs, reverse}` no la incluye). Como `series_items` ordena el feed por `pub_date DESC` (newest first) y la cascada de "mark seen" usa `pub_date <=` para marcar los anteriores, los items sin fecha romperían ambas cosas. Solución: se asigna `pub_date = base + índice`, con la convención **`result[0]` = capítulo más viejo** (Chapter 1, el primero cronológicamente). Así:

- `result[0]` (Chapter 1) tiene `pub_date` más bajo → aparece al final del feed (que ordena DESC).
- `result[N-1]` (Chapter 97) tiene `pub_date` más alto → aparece arriba del feed.
- Cascada "mark seen": marcar Chapter 90 como visto marca todos los de `pub_date <=` → Chapters 1-89 (los anteriores cronológicamente). Correcto.
- Items ya insertados **conservan su `pub_date` original** (INSERT OR IGNORE no actualiza). Capítulos nuevos aparecen **al final del array post-reverse** (después del último capítulo existente), reciben `base + i` más alto y se ordenan arriba del feed. Correcto.

**El toggle `reverse` y esta convención:** el usuario debe entregar al backend un array **oldest→newest** (Chapter 1 primero). Si el sitio lista newest→oldest (como witchhatatelier, donde el DOM trae Chapter 97 arriba), el usuario activa `reverse: true` para que el backend invierta y cumpla la convención. Si el sitio ya lista oldest→newest, `reverse: false`. La regla se documenta en el hint del form: *"Activate reverse if the site lists newest chapters first."*

**Contract del config:** `{ selector: string (req), url_attr?: string (default 'href'), label_attr?: string (default 'text'), reverse?: boolean (default false) }`. El selector debe producir al menos un match (si no, error `"selector '<sel>' matched no elements"`). Cada match debe tener el atributo URL (si no, error `"some elements have no '<attr>' attribute"`). Cualquier desviación → throw con mensaje claro → `last_error`.

### 2. Orquestador — `backend/src/sources/index.mjs`

`fetchItems` gana un segundo argumento opcional. **Si llega `config`, la ruta custom tiene prioridad absoluta** (intención explícita del usuario). Sin `config`, el flujo es el de Épica 12 sin tocar una línea:

```js
// ANTES (Épica 12):
export const fetchItems = async (url) => { ... }

// DESPUÉS (Épica 14):
export const fetchItems = async (url, opts = {}) => {
  // Ruta custom: config explícito del usuario → adapter genérico.
  // Tiene prioridad sobre la detección por host (comivex) y sobre el sniff de RSS.
  if (opts.config) return CUSTOM_ADAPTER.fetch(url, opts.config)

  // ... resto del algoritmo de Épica 12 (host → comivex; sniff → rss; default rss) SIN CAMBIOS
}
```

- **comivex intacto:** una serie de comivex sin `source_config` (todas las existentes) sigue cayendo en `adapterByHost('comivex.com')` → `COMIVEX_ADAPTER`. Cero regresión.
- **Override explícito:** si el usuario agrega un `source_config` a una URL de comivex, gana la ruta custom (el usuario decidió scrapear manualmente).
- El orquestador sigue sin saber de `series` ni `series_items`: solo produce `{ items }`.

### 3. Refresher — `backend/src/refresher.mjs`

`refreshManga` pasa el `source_config` al orquestador. Un solo cambio:

```js
// ANTES:
const { items } = await sources.fetchItems(s.rss_url)

// DESPUÉS:
const { items } = await sources.fetchItems(s.rss_url, { config: s.source_config })
```

- Si `s.source_config` es `null`/`undefined` (la mayoría de los mangas), `opts.config` es falsy → flujo Épica 12.
- `refreshAll` y `refreshByUser`: **sin cambios**. La query `WHERE rss_url IS NOT NULL` ya trae cualquier manga con URL; el `source_config` viaja dentro del row `s` y se pasa en la llamada.
- Handler de errores: idéntico (catch → `last_error.slice(0, 500)`).

### 4. Modelo de datos

- **Nueva columna:** `series.source_config TEXT` (nullable, JSON). Sólo aplica a `type = 'manga'`.
  - Bases nuevas: se incluye en el `CREATE TABLE series` de `backend/src/models/db.mjs`.
  - Bases existentes: `addColumnIfMissing('series', 'source_config', 'TEXT')` en el bloque `ready` (idempotente, análogo a cómo se agregó `rss_url` en Épica 9 y `last_read` en Épica 10).
- **Serialización:** se persiste como string JSON (`JSON.stringify(config)` al guardar, `JSON.parse(value)` al leer, con try/catch que cae a `null` si el JSON está corrupto). Las queries SQL no filtran por sub-campos del JSON — no se agregan columnas virtuales ni nada similar; el backend siempre lo parsea en JS.
- **Sin migración de valores:** columna nueva, arranca vacía (`NULL`). Los mangas existentes (con RSS o comivex) no se tocan — su `source_config` queda `NULL` y siguen por su ruta actual.
- `series_items`: **sin cambios**. Los items del adapter custom normalizan al mismo `{ guid, title, link, pub_date }`.

#### Por qué JSON en una columna y no 4 columnas separadas

Alternativa considerada: 4 columnas separadas (`source_selector`, `source_url_attr`, `source_label_attr`, `source_reverse`). Descartado porque:
- Ensucia el schema de `series` con 4 columnas para una feature opcional que sólo aplica a manga y que la mayoría de las series no usa.
- Las queries SQL nunca filtran por estos campos (el backend los lee todos juntos para pasárselos al adapter). No hay valor en tenerlos como columnas individuales.
- JSON es extensible: si en el futuro se suman opciones (p. ej. filtrar por texto dentro del label, ignorar N elementos, tomar atributos compuestos) se agregan keys al objeto sin migración.
- El patrón ya existe en el código: `reel_fetch.mjs` y otros parsean strings arbitrarios; no hay convención estricta de "un campo = una columna" para metadata de feature opt-in.

### 5. Validación y handlers — `backend/src/index.mjs`

#### `validateSeries(body, partial)`

Nuevas reglas para `source_config` (análogas a las de `rss_url`):

- **Sólo manga:** si `type === 'anime'` y viene `source_config` no-nulo → error `"source_config is only for manga; anime uses imdb_url"`.
- **Requiere `rss_url`:** si `source_config` viene no-nulo pero `rss_url` está vacío/nulo → error `"source_config requires a feed URL (rss_url)"`. La config corre contra el HTML de esa URL; sin URL no hay dónde aplicarla.
- **Shape válida:** si viene no-nulo, debe ser objeto con `selector` string no-vacío. `url_attr`, `label_attr` strings opcionales (defaults `'href'`/`'text'`). `reverse` boolean opcional (default `false`). Cualquier otro tipo → error `"source_config must be an object { selector, url_attr?, label_attr?, reverse? }"`.

  ```js
  const validateSourceConfig = (cfg) => {
    const errs = []
    if (typeof cfg !== 'object' || Array.isArray(cfg) || cfg === null) {
      return ['source_config must be an object { selector, url_attr?, label_attr?, reverse? }']
    }
    if (typeof cfg.selector !== 'string' || !cfg.selector.trim()) {
      errs.push('source_config.selector is required and must be a non-empty string')
    }
    if ('url_attr' in cfg && typeof cfg.url_attr !== 'string') errs.push('source_config.url_attr must be a string')
    if ('label_attr' in cfg && typeof cfg.label_attr !== 'string') errs.push('source_config.label_attr must be a string')
    if ('reverse' in cfg && typeof cfg.reverse !== 'boolean') errs.push('source_config.reverse must be a boolean')
    return errs
  }
  ```
- **No se valida contra el HTML** en validación (eso pasa en preview/refresh). Sólo validación de tipos.

#### `POST /api/series` y `PUT /api/series/:id`

- El `payload`/`fields` incluye `source_config` (ya como string JSON) sólo para manga:
  ```js
  // POST
  source_config: isAnime ? null : (req.body.source_config ? JSON.stringify(req.body.source_config) : null)

  // PUT (igual que rss_url): respeta el valor del body o conserva el existente
  if (isManga) {
    fields.source_config = req.body.source_config !== undefined
      ? (req.body.source_config ? JSON.stringify(req.body.source_config) : null)
      : existing.source_config
  } else {
    fields.source_config = null
  }
  ```
- `ALLOWED_FIELDS` en `series.mjs` agrega `'source_config'`.
- `series.create` agrega `source_config` al `INSERT`.

#### `GET /api/series/:id` y `GET /api/dashboard`

Exponer `source_config` en la respuesta **parseado como objeto** (no como string crudo) para que el frontend pueda pre-poblar los 4 inputs directamente:

```js
// en el map del response:
source_config: typeof s.source_config === 'string' ? safeParse(s.source_config) : s.source_config

const safeParse = (str) => {
  try { return JSON.parse(str) } catch { return null }
}
```

### 6. Endpoint de preview — nuevo — `POST /api/sources/preview`

Permite al usuario **ver cómo se verá el listado antes de guardar** la serie. Fetchea la URL, aplica el selector + attrs + reverse, normaliza (igual que el refresh real) y devuelve los items en el **mismo orden en que aparecerán en el feed del detalle** (newest-first):

```
POST /api/sources/preview    [verifyToken, getUser, resolveUserId]
Body: { url: string, config: { selector, url_attr?, label_attr?, reverse? } }
→ 200 { items: [{title, link}], count: N, token }   // items en orden newest-first (como el feed)
→ 400 { error: "..." }   (selector sin matches, fetch fallido, todos los elementos sin url_attr)
```

- **Protegido** (auth requerida): fetch de URLs arbitrarias es sensible; no se expone anónimamente.
- **No persiste nada:** es un dry-run. Llama a `CUSTOM_ADAPTER.preview(url, config)` que ejecuta el mismo pipeline que `fetch` (extract + reverse + normalize) pero sin insertar en `series_items`. Devuelve `{title, link}` en orden newest-first (reverse del array normalizado, que está oldest-first) para que el frontend pueda renderizar el listado idéntico a como lo haría `SeriesDetail.vue`.
- **Sin `guid` ni `pub_date` en la respuesta:** no se persisten, y el `pub_date` sintético confundiría al usuario (timestamps raros). El orden ya viene dado por el array (newest-first); el frontend sólo itera y muestra `title` (+ `link` en gris o como hover). Si el usuario quiere ver la fecha real, eso lo ve en el detalle tras guardar+refrescar.
- **Límite de items en la respuesta:** se devuelven todos (para mostrar el `count` real), pero el frontend puede truncar la lista visible con scroll. Típicamente <200 items.
- **Errores comunes** que devuelve como 400 con mensaje claro:
  - URL no responde / 4xx / 5xx → `"fetch failed: HTTP 503"`.
  - Selector sin matches → `"selector 'table tr td a' matched no elements"`.
  - Algunos elementos sin el atributo URL → `"some elements have no 'href' attribute"`.
  - `config` malformada → errores de `validateSourceConfig`.

### 7. Frontend — `frontend/src/components/SeriesForm.vue`

#### Advanced mode (toggle, sólo para manga)

El formulario se ve **exactamente igual que hoy** por defecto. Cuando `form.type === 'manga'`, debajo del campo de feed aparece un botón **"Advanced mode"**. Los campos de scraping **sólo se renderizan después** de activar el toggle — nunca antes. Al activarlo se revelan:

1. **Selector CSS** — input text, label **"Selector"**, placeholder `table tr td a`. Hint: *"CSS selector for the chapter links (the `<a>` tags). Use DevTools → Inspect to find it."*
2. **URL attribute** — input text, label **"URL attribute"**, placeholder `href`. Hint: *"Which attribute holds the link URL. Usually 'href'."*
3. **Label attribute** — input text, label **"Label attribute"**, placeholder `text`. Hint: *"Which attribute holds the chapter title. Use 'text' for the visible text, or an attribute name like 'title'."*
4. **Reverse toggle** — checkbox/switch, label **"Reverse order"**, hint: *"Activate if the site lists newest chapters first (so they become last after scraping)."*

(El campo `rss_url` ya existe en el form base; en advanced mode sólo cambia su label a **"Site URL to scrape"** para indicar que es el sitio sobre el que corre la config. Es el mismo campo `rss_url`, no uno nuevo.)

#### Botones en `.actions`: Save, Preview, Cancel

La fila de acciones del form cambia de `[Save] [Cancel]` a **`[Save] [Preview] [Cancel]`**. El botón **Preview** es el que reemplaza al "Test" de la versión anterior — ya no vive dentro del advanced mode, sino en las actions principales, porque aplica a la config propuesta y muestra el resultado antes de guardar:

- **Visible sólo cuando hay config aplicable:** `form.type === 'manga' && advanced && form.rss_url.trim() && form.source_selector.trim()`. Si no (anime, manga sin advanced, o advanced sin selector/URL), no se renderiza y el form queda con `[Save] [Cancel]` como hoy.
- **Comportamiento:** al click, llama a `POST /api/sources/preview` con `{url: form.rss_url, config: buildConfig()}`.
  - Mientras carga: spinner / botón deshabilitado.
  - Éxito: abre un **panel de preview** (debajo de las actions) con **"N items"** + una lista scrollable de los `title` en el orden exacto en que aparecerán en el feed (newest-first, igual que `SeriesDetail.vue`). Cada item muestra su `title`; opcionalmente el `link` en gris o como tooltip. La lista se puede truncar (p. ej. mostrar los primeros 20 con scroll para el resto).
  - Error: muestra el mensaje del backend en el panel de preview en rojo (sin bloquear el form — el usuario puede ajustar y reintentar).
- **No guarda nada:** Preview es un dry-run. El usuario ajusta la config, da Preview de nuevo, y cuando el listado le parece correcto, recién ahí da **Save**.

#### Panel de preview

Debajo de `.actions`, un panel condicional (`v-if="preview.items.length || preview.error"`) que muestra el resultado del último Preview:

```
.preview-panel
  .preview-header
    span.count {{ preview.count }} items found
    span.error(v-if="preview.error") {{ preview.error }}
  .preview-list(v-if="preview.items.length")
    .preview-item(v-for="item in preview.items")
      span.title {{ item.title }}
      span.link {{ item.link }}
```

Estilos: lista con `max-height` (p. ej. 320px) y `overflow-y: auto` para que no crezca indefinidamente. Mismo look-and-feel que el feed de `SeriesDetail.vue` para que el usuario reconozca el formato.

#### Estado en `data()`

```js
data () {
  return {
    form: {
      type: 'manga',
      name: '', url: '', cover_url: '',
      imdb_url: '', rss_url: '',
      source_selector:  '',          // 'table tr td a'
      source_url_attr:  '',          // 'href'  (string vacío = default 'href' en backend)
      source_label_attr: '',         // 'text'  (string vacío = default 'text' en backend)
      source_reverse:   false        // toggle
    },
    advanced: false,                 // advanced mode open? (false = campos ocultos)
    preview: { loading: false, error: '', items: [], count: 0 }
  }
}
```

#### `buildConfig()` / `applyConfig(obj)`

Helpers que serializan/deserializan entre los 4 inputs del form y el objeto `source_config` que viaja en el payload:

```js
// 4 inputs → objeto (para enviar al backend y persistir)
buildConfig () {
  const cfg = { selector: this.form.source_selector.trim() }
  if (this.form.source_url_attr.trim())   cfg.url_attr   = this.form.source_url_attr.trim()
  if (this.form.source_label_attr.trim()) cfg.label_attr = this.form.source_label_attr.trim()
  if (this.form.source_reverse)           cfg.reverse    = true
  return cfg
},

// objeto → 4 inputs (para pre-poblar el form en edición)
applyConfig (cfg) {
  this.form.source_selector   = cfg?.selector   || ''
  this.form.source_url_attr   = cfg?.url_attr   || ''
  this.form.source_label_attr = cfg?.label_attr || ''
  this.form.source_reverse    = !!cfg?.reverse
}
```

#### `runPreview()` — método del botón Preview

```js
async runPreview () {
  this.preview = { loading: true, error: '', items: [], count: 0 }
  try {
    const res = await api.post('/api/sources/preview', {
      url: this.form.rss_url.trim(),
      config: this.buildConfig()
    })
    this.preview = { loading: false, error: '', items: res.data.items, count: res.data.count }
  } catch (e) {
    this.preview = {
      loading: false,
      error: (e.response && e.response.data && e.response.data.error) || 'Preview failed',
      items: [], count: 0
    }
  }
}
```

#### Comportamiento del toggle advanced

- **Off (default):** los 4 inputs de source **no se renderizan**; el botón Preview tampoco; al submit, `source_config` se manda como `null`. El flujo es el de hoy (RSS/comivex). El form se ve idéntico a antes de esta épica.
- **On:** los 4 inputs aparecen y (si hay selector + URL) el botón Preview aparece en las actions.
- **Edición:** si la serie cargada (`load()`) trae `source_config` no-nulo, el advanced mode arranca **abierto** y los 4 inputs se pre-poblan vía `applyConfig(source_config)`.
- **Toggle de tipo:** si el usuario cambia de manga a anime, los 4 campos se limpian, el advanced mode se cierra y el panel de preview se limpia (extender el watcher existente).
- **Cualquier cambio en los inputs de source** limpia el panel de preview previo (stale) — el usuario debe darle Preview de nuevo para ver el resultado actualizado. Se puede implementar con un watcher sobre los 4 campos que resetee `preview.items = []`.

#### Payload del submit (Save)

```js
const payload = {
  type: this.form.type,
  name: ...,
  url: ...,
  cover_url: ...,
  imdb_url: isAnime ? (...) : null,
  rss_url: isAnime ? null : (this.form.rss_url.trim() || null),
  source_config: isAnime ? null : (this.advanced && this.form.source_selector.trim() ? this.buildConfig() : null)
}
```

Save no depende del Preview — el usuario puede guardar sin haber previsualizado (igual que hoy puede guardar un feed RSS sin testear). Pero la UX recomendada es: ajustar config → Preview → confirmar → Save.

#### `SeriesDetail.vue`

**Sin cambios funcionales.** El feed viene de `series_items` (feed-agnóstico). Opcionalmente, si la serie tiene `source_config`, el indicador `feedLabel` podría decir "Custom" en vez de "RSS" — pero no es bloqueante. Se deja como nice-to-have.

### 8. Env vars — `env_example`

```
CUSTOM_SOURCE_USER_AGENT "User-Agent for fetching HTML in the generic source-config scraper (realistic browser UA)"
CUSTOM_SOURCE_TIMEOUT 15000
```

A diferencia de la versión con query JS + sandbox, **no hay** `CUSTOM_SOURCE_QUERY_TIMEOUT` — no se ejecuta JS arbitrario y el selector es trivial (cheerio resuelve un selector CSS en <10ms sin posibilidad de loop).

---

## Migración de datos

- `ALTER TABLE series ADD COLUMN source_config TEXT` vía `addColumnIfMissing` (idempotente, corre en el bloque `ready` antes de `createTable`).
- **Sin migración de valores:** columna nueva. Los mangas existentes quedan con `source_config = NULL` y siguen su ruta actual (RSS o comivex). Cero impacto en producción.
- `series_items`: sin migración. Los items existentes se conservan intactos.

---

## Tareas

### Backend
- [ ] `backend/src/models/db.mjs`: `addColumnIfMissing('series', 'source_config', 'TEXT')` en el bloque `ready`; incluir `source_config TEXT` en el `CREATE TABLE series`.
- [ ] `backend/src/models/series.mjs`: agregar `'source_config'` a `ALLOWED_FIELDS`; incluirlo en el `INSERT` de `create`.
- [ ] `backend/src/sources/custom.mjs` (**nuevo**): `CUSTOM_ADAPTER` con `fetch(url, config)`, `parse(body, url, config)`, `preview(url, config)`. Helpers: `fetchHTML`, `extractItems` (cheerio.load + selector + readAttr + optional reverse), `readAttr` (maneja `'text'`, `'html'`, nombre de atributo), `normalizeItems` (con resolución de URLs relativas vía `new URL`). **Sin dependencias nuevas** — `cheerio` ya está instalado, no se usa `vm` ni sandbox.
- [ ] `backend/src/sources/index.mjs`: `fetchItems(url, opts = {})` — si `opts.config`, delega a `CUSTOM_ADAPTER.fetch(url, opts.config)` antes de la detección por host/sniff. Importar `CUSTOM_ADAPTER`.
- [ ] `backend/src/refresher.mjs`: `refreshManga` pasa `{ config: s.source_config }` a `sources.fetchItems`.
- [ ] `backend/src/index.mjs`:
  - `validateSourceConfig(cfg)` helper (shape + tipos).
  - `validateSeries`: reglas de `source_config` (sólo manga, requiere `rss_url`, shape válida).
  - `POST /api/series` y `PUT /api/series/:id`: persistir `source_config` como string JSON (manga only, `null` para anime).
  - `GET /api/series/:id` y `GET /api/dashboard`: exponer `source_config` parseado como objeto en el response.
  - `POST /api/sources/preview` (**nuevo**, protegido): dry-run del custom adapter, devuelve items crudos `{url,label}`.
- [ ] `env_example`: `CUSTOM_SOURCE_USER_AGENT`, `CUSTOM_SOURCE_TIMEOUT`.

### Frontend
- [ ] `frontend/src/components/SeriesForm.vue`:
  - Advanced mode toggle (sólo manga) con estado `advanced` en `data()`. Los 4 inputs de source **sólo se renderizan cuando `advanced === true`** — nunca antes.
  - 4 inputs (selector, url_attr, label_attr, reverse toggle).
  - Botón **"Preview"** en la fila `.actions` (junto a Save y Cancel), visible sólo cuando `advanced && rss_url && selector`. Reemplaza al "Test" interno de la versión anterior.
  - Método `runPreview()` que llama a `/api/sources/preview` con `{url, config: buildConfig()}`.
  - Panel de preview (debajo de `.actions`): muestra `count` + lista scrollable de `title` en orden newest-first (como el feed del detalle); estilos con `max-height` + `overflow-y: auto`.
  - Watcher sobre los 4 inputs de source que limpia el panel de preview previo al cambiar cualquier campo (evita mostrar resultados stale).
  - Helpers `buildConfig()` / `applyConfig(cfg)` para serializar/deserializar.
  - Pre-poblar los 4 inputs en `load()` vía `applyConfig`; abrir advanced mode si tiene valor.
  - Limpiar los 4 campos + cerrar advanced + limpiar panel de preview al toggleear a anime (extender watcher existente).
  - Incluir `source_config` en el payload del submit (Save).

### Tests
- [ ] `backend/tests/smoke-sources.mjs` (ampliar):
  - `CUSTOM_ADAPTER` con el fixture de witchhatatelier: extractItems con `{selector: 'table tr td a', url_attr: 'href', label_attr: 'text', reverse: true}` → 112 items.
  - `extractItems` sin reverse → 112 items en orden newest-first; con reverse → oldest-first.
  - `readAttr`: `'text'` → `$(el).text()`; `'href'` → `$(el).attr('href')`; atributo inexistente → `''`.
  - `normalizeItems`: guid `custom:{hash}`, `pub_date` ascendente por índice, fallback `title=link` si no hay label, resolución de URLs relativas.
  - Errores: selector sin matches → throw claro; elementos sin url_attr → throw claro.
  - `fetchItems(url, { config })` rutea al custom adapter; `fetchItems(url)` (sin config) sigue ruteando por host/sniff (regresión Épica 12).
- [ ] `backend/tests/smoke-rss-engine.mjs` (ampliar): manga con `source_config` + `rss_url` → refresh inserta items vía custom adapter; manga con `rss_url` sin `source_config` → sigue por RSS/comivex (regresión).
- [ ] `backend/tests/smoke-series-crud.mjs` (ampliar): `POST /api/series` con `type=manga` + `source_config` + `rss_url` persiste (y se lee de vuelta como objeto); `source_config` sin `rss_url` → 400; `source_config` en anime → 400; `source_config` sin `selector` → 400; `source_config` que no es objeto → 400.
- [ ] `backend/tests/fixtures/witchhatatelier.html` (**nuevo**): snapshot del HTML de `https://w18.witchhatatelier.com/` para tests offline (igual que `comivex-1295.html` en Épica 12).
- [ ] Smoke existentes siguen en verde.

## Verificación

- [ ] Manga creado con `rss_url` de **feed RSS real** y **sin** `source_config` → refresh inserta items vía RSS (sin regresión, Épica 9/12).
- [ ] Manga creado con `rss_url` de **comivex.com** y **sin** `source_config` → refresh usa el adapter comivex dedicado (sin regresión, Épica 12). **Crítico: no romper esto.**
- [ ] Manga creado con `rss_url = https://w18.witchhatatelier.com/` y `source_config = {selector: 'table tr td a', url_attr: 'href', label_attr: 'text', reverse: true}` → refresh inserta **112 items** con guids `custom:{hash}` estables y pub_dates ascendentes (Chapter 1 más viejo, Chapter 97 más nuevo).
- [ ] Segundo refresh del mismo manga no duplica items (dedupe por `guid`).
- [ ] `POST /api/sources/preview` con esa URL + config → 200 con `count: 112` y array de `{title, link}` en orden newest-first (Chapter 97 primero, Chapter 1 último).
- [ ] `POST /api/sources/preview` con selector que no existe (`'.nonexistent'`) → 400 claro.
- [ ] `POST /api/sources/preview` sin `selector` en config → 400 claro.
- [ ] Manga con `source_config` pero sin `rss_url` → validación 400.
- [ ] Anime con `source_config` → validación 400.
- [ ] El feed del manga de witchhatatelier se ordena newest-first (Chapter 97 arriba, `ORDER BY pub_date DESC`) y la cascada "mark seen" funciona (marcar Chapter 90 marca Chapter 1-89).
- [ ] `refreshAll` (scheduler) procesa mezcla de mangas (RSS, comivex, custom config) sin errores.
- [ ] Edición de un manga con `source_config`: el form abre advanced mode y pre-pobla los 4 campos; guardar conserva el valor.
- [ ] **UX del form:** con `advanced === false`, los 4 inputs de source y el botón Preview **no se renderizan** (el form se ve igual que hoy). Al activar advanced, aparecen los inputs; al llenar selector + URL, aparece el botón Preview en `.actions`.
- [ ] **Botón Preview:** al click, fetchea y muestra el panel con el listado en orden newest-first (igual que el feed del detalle). Si se edita un campo, el panel se limpia hasta el próximo Preview.

## Cómo reproducir la verificación

- **Sources + custom adapter:** `cd backend && DB_PATH=./test.sqlite node tests/smoke-sources.mjs`.
- **Dispatch por type (regresión):** `cd backend && DB_PATH=./test.sqlite node tests/smoke-rss-engine.mjs`.
- **CRUD + validación:** `cd backend && DB_PATH=./test.sqlite node tests/smoke-series-crud.mjs`.
- **Regresión completa:** `cd backend && for t in smoke-auth smoke-data-model smoke-series-crud smoke-imdb-engine smoke-rss-engine smoke-sources smoke-dashboard smoke-series-detail smoke-reels; do rm -f test.sqlite && DB_PATH=./test.sqlite SECRET=test node tests/$t.mjs; done`.
- **Frontend build:** `cd frontend && API=http://localhost:3000 BUILD_OUT_DIR=dist npm run build`.
- **Manual (E2E):**
  1. Levantar dev.
  2. New series → Graphic novel → Advanced mode.
  3. Site URL: `https://w18.witchhatatelier.com/`.
  4. Selector: `table tr td a`. URL attr: `href`. Label attr: `text`. Reverse: ✓.
  5. Preview → ver "112 items found" + lista en orden newest-first (Chapter 97 arriba, Chapter 1 abajo).
  6. Save → disparar refresh → ver los capítulos en el detalle (mismo orden que el preview).

---

## Alternativas consideradas

- **Un adapter `cheerio` por cada sitio nuevo** (extender el patrón de comivex con código fijo por dominio). **Descartado:** no escala. Cada sitio es un archivo nuevo con selectores frágiles que se rompen al primer rediseño. El approach de config-del-usuario mueve el costo del mantenimiento al usuario (que ya está navegando el sitio) y lo desacopla del backend.
- **`source_query` como string JS ejecutado en sandbox `vm`** (versión anterior de esta épica). **Descartado por simplificación de UX:** exigirle al usuario escribir JS tipo `$('sel').map(...).get()` es más propenso a errores que 3 campos + 1 toggle. Además, ejecutar JS arbitrario requiere un sandbox (`vm` no es un sandbox de seguridad real según los docs de Node), agrega superficie de ataque y un caso de fallo más (loops infinitos → timeout). El approach de config fija (selector + attrs + reverse) cubre el 99% de los casos de scraping de listas de capítulos sin ninguno de esos costos.
- **`jsdom` + sintaxis de DevTools console** (pegar `document.querySelectorAll(...)` directo). **Descartado:** agrega `jsdom` (~10MB, dependencia pesada con sub-deps propias) cuando `cheerio` ya está instalado. Y sigue requiriendo que el usuario escriba JS en vez de llenar campos.
- **Headless browser (`puppeteer` / `playwright`)** para scrapear SPAs o sitios con JS rendering. **Descartado:** pesado (Chromium binary, ~200MB+), lento (boot de browser por refresh), y complejo de deployar. `cheerio` corre en el mismo proceso de Node, es ~50x más rápido y no requiere binarios externos. La mayoría de los sitios de manga son HTML server-rendered.
- **Persistir la config en 4 columnas separadas** (`source_selector`, `source_url_attr`, `source_label_attr`, `source_reverse`). **Descartado:** ensucia el schema de `series` con 4 columnas para una feature opt-in. Las queries SQL nunca filtran por estos campos (el backend los lee juntos para el adapter). JSON en una columna `source_config TEXT` es más limpio y extensible (sumar opciones futuras no requiere migración). Ver sección *Modelo de datos*.
- **Permitir que la config incluya un campo `date_attr`** para items con fecha real. **Postergado:** el contract base es `{selector, url_attr, label_attr, reverse}` (cubre el caso de prueba y la mayoría de los sitios). Si un usuario necesita fechas reales, se puede extender la config con `date_attr` (con un parser configurable) y `normalizeItems` para leerlo. Se documenta como enhancement futuro, no como MVP.
- **Validar el selector contra el HTML al guardar** (POST/PUT). **Descartado:** la validación real (selector existe, attrs presentes) requiere fetch del sitio, que es lo que hace el endpoint de preview. Validar en guardado agregaría latencia y complejidad; el preview ya cubre el "test antes de guardar". Si el usuario guarda sin testear y el selector está mal, el error se manifiesta en `last_error` al primer refresh — consistente con cómo funcionan los feeds RSS rotos hoy.
- **No agregar endpoint de preview y confiar en el refresh.** **Descartado:** la UX de "llena campos, guardá, refrescá, mirá el error" es frustrante. El preview permite iterar la config en segundos sin crear/editar la serie.

---

## Notas

### Sin sandbox ni ejecución de JS — modelo de seguridad simple

A diferencia de la versión anterior de esta épica (que ejecutaba un query JS del usuario en `vm`), este approach **no ejecuta JS arbitrario**. El backend sólo aplica un selector CSS (cheerio, nativo y determinístico) y lee atributos. No hay posibilidad de loops infinitos, acceso al sistema de archivos, ni escape de sandbox. La única operación "sensible" es el fetch HTTP a una URL arbitraria — ya mitigado con auth requerida en el endpoint de preview y en el refresh (bajo el scheduler autenticado). No se necesita `vm`, `isolated-vm`, ni timeout de query.

### `pub_date` sintético y la cascada "mark seen"

Los items del adapter custom no tienen fecha real (la config no la incluye). Se asigna `pub_date = base + índice`, con la convención **`result[0]` = capítulo más viejo** (Chapter 1, el primero cronológicamente). Esto hace que:

- El feed (ordenado por `pub_date DESC`) muestre newest-first: Chapter 97 arriba, Chapter 1 abajo.
- La cascada "mark seen up to" (que usa `pub_date <=`) funcione: marcar Chapter 90 como visto marca todos los de `pub_date <=` → Chapters 1-89 (los anteriores cronológicamente). Correcto.
- Items ya insertados conservan su fecha original (INSERT OR IGNORE no actualiza). Capítulos nuevos aparecen **al final del array post-reverse** (después del último capítulo existente), reciben `base + i` más alto y se ordenan arriba del feed. Correcto.

### El toggle `reverse` y la convención oldest-first

La convención del backend es **"el array final (después del reverse opcional) debe estar oldest→newest"** (Chapter 1 primero). El usuario activa `reverse: true` cuando el sitio le entrega el orden opuesto (newest-first, como witchhatatelier donde el DOM trae Chapter 97 arriba). Si el sitio ya lista oldest→newest, `reverse: false`.

La regla se documenta en el hint del form: *"Activate reverse if the site lists newest chapters first."* El usuario puede verificar el orden correcto en el preview (que muestra los items en el orden final, post-reverse).

### Resolución de URLs relativas

`cheerio` devuelve el atributo `href` crudo (`$(el).attr('href')`) — NO resuelve a URL absoluta como lo haría la propiedad `.href` de un DOM real. Para que la config funcione con sitios que usan URLs relativas (`/manga/chapter-1/`), `normalizeItems` resuelve cada URL contra `baseUrl` con `new URL(item.url, baseUrl).href`. Si el sitio ya usa URLs absolutas (como witchhatatelier), `new URL` las deja intactas. El usuario no necesita preocuparse por resolver URLs.

### Performance

- `cheerio.load` de una página típica (~200KB HTML, ~100 elements): ~5-20ms.
- Selector + extract + reverse: <10ms para páginas típicas.
- Fetch HTTP: depende del sitio (500ms-3s).
- Total por refresh de un manga custom: ~1-3s. Comparable al adapter comivex. No hay impacto en el scheduler (que ya duerme 800ms entre fetches).

### Sin dependencias nuevas

Este approach **no agrega ninguna dependencia**. `cheerio@^1.2.0` ya está en `backend/package.json` desde la Épica 12 (lo usa `backend/src/sources/comivex.mjs`). El adapter custom reusa el mismo `cheerio.load(html)` que ya funciona en producción. No se usa `jsdom`, `vm`, ni ninguna otra dep nueva.

---

## Archivos a modificar / crear

- `backend/src/sources/custom.mjs` (**nuevo**, adapter genérico: cheerio + extract + normalize, sin deps nuevas, sin vm).
- `backend/src/sources/index.mjs` (`fetchItems(url, opts)` — rama `opts.config` → custom adapter; resto sin cambios).
- `backend/src/refresher.mjs` (`refreshManga` pasa `{ config: s.source_config }`).
- `backend/src/models/db.mjs` (`addColumnIfMissing('series', 'source_config', 'TEXT')` + columna en `CREATE TABLE`).
- `backend/src/models/series.mjs` (`'source_config'` en `ALLOWED_FIELDS` + `INSERT` de `create`).
- `backend/src/index.mjs` (`validateSourceConfig` helper; `validateSeries` reglas de `source_config`; POST/PUT persisten como JSON; GET exponen parseado; `POST /api/sources/preview` nuevo).
- `backend/tests/smoke-sources.mjs` (ampliar: custom adapter, extract, normalize, errores, routing).
- `backend/tests/smoke-rss-engine.mjs` (ampliar: dispatch manga con source_config).
- `backend/tests/smoke-series-crud.mjs` (ampliar: validación de source_config).
- `backend/tests/fixtures/witchhatatelier.html` (**nuevo**, snapshot HTML para tests offline).
- `frontend/src/components/SeriesForm.vue` (advanced mode toggle + 4 inputs + botón Test + preview + buildConfig/applyConfig).
- `env_example` (`CUSTOM_SOURCE_USER_AGENT`, `CUSTOM_SOURCE_TIMEOUT`).
- `docs/AGENTS.md` y `docs/PROJECT.md` (decisión 13 + fila en la tabla de épicas).
- `docs/ARCHITECTURE.md` (nueva columna en schema, nuevo endpoint, nuevo módulo `sources/custom.mjs`, env vars — al implementar, regla 13).
