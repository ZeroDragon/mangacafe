# Épica 16 — Reels → Bookmarks (UI) + click en el título abre y marca visto

**Estado:** `[DONE]`
**Objetivo:** Dos cambios de producto **puramente frontend** sobre la sección que hoy se llama "Reels":

1. **Renombrarla a "Bookmarks" en la UI** y reemplazar la imagen fija (`reel-thumb.png`) por un **glyph** (Material Symbols `bookmark`). La DB, el modelo, las rutas y los env vars del backend **no se tocan** — igual que la Épica 13 renombró "Anime/Manga"→"Show/Graphic novel" sólo en la capa de presentación.
2. **El título pasa a abrir el link Y marcar como visto a la vez.** Hoy el título es un `<a>` que sólo abre la URL; el checkmark aparte es el que marca. Ahora el título hace ambas cosas (abre en tab nueva + marca visto/pendiente), y el **checkmark se conserva** como toggle puro (marcar sin abrir). No se agrega ningún icono extra.

**Depende de:** Épica 11 (reels), Épica 6 (detalle de serie), Épica 5 (dashboard).
**Habilita:** una sección de bookmarks genérica en la UI y un flujo "abro y marco de un click" sin acciones duplicadas.

---

## Contexto / motivación

### Por qué rename sólo UI (no full-rename)

La Épica 13 sentó el precedente: `series.type` usa valores internos (`'anime'`/`'manga'`) estables, y la UI muestra etiquetas distintas ("Show"/"Graphic novel"). El usuario pidió aquí el mismo enfoque: **no tocar backend ni DB**. Los valores internos (`reels`, `/api/reels`, `reel.mjs`, `REEL_*`, `summary.reelsPending`, `type:'reel'`) quedan como ids técnicos; la UI dice "Bookmarks". Mínimo riesgo, cero migración.

### Por qué quitar la imagen

`reel-thumb.png` era un thumbnail fijo de FB (descargado de popsters.ru). Con el rename a bookmarks genéricos ya no representa nada, y un glyph `bookmark` es neutro, escalable y consistente con el resto de la UI (que usa Material Symbols en todos lados). **El archivo se deja en `public/`** (sin referencias tras el cambio) para no tocar assets binarios; si se quiere limpiar después, es un commit separado.

### Por qué el título abre-y-marca

El usuario quiere que el link sirva para **ir al item y marcarlo al mismo tiempo**. Es el uso natural: abrís el capítulo → lo marcaste visto en el mismo click. El checkmark aparte queda para los casos donde **sólo** querés marcar sin navegar. No hay icono `open_in_new` extra: el título ya es el affordance de "abrir".

### Decisiones de producto (nuevas — agregar a `AGENTS.md` y `PROJECT.md`)

| # | Decisión | Valor |
|---|----------|-------|
| 15 | "Reels" → "Bookmarks" en la UI (rename cosmético) | La UI muestra **"Bookmarks"** para la sección de reels. Los valores internos (`tabla reels`, `/api/reels`, `reel.mjs`, `REEL_*`, `summary.reelsPending`, `type:'reel'`) **no cambian** — son ids estables. El thumbnail fijo `reel-thumb.png` se reemplaza por un glyph Material Symbols `bookmark` en el card del dashboard y en cada item de la lista. Backend y DB intactos (Épica 16). |
| 16 | Click en el título abre el link y marca visto | En el detalle de serie (Show/Graphic novel) y en Bookmarks, el **título sigue siendo un `<a target="_blank">`** pero además **marca el item como visto** al click (toggle visto↔pendiente, mismo efecto que el checkmark). El botón de checkmark **se conserva** como toggle puro (marcar sin abrir). No se agrega icono `open_in_new` extra (Épica 16). |

---

## Alcance

### 1. Frontend — `frontend/src/components/Reels.vue` (sin renombrar el archivo)

Rename **sólo de textos visibles y nombres lógicos internos del componente** (la URL de la API sigue siendo `/api/reels`):

- `name: 'Reels'` → `name: 'Bookmarks'` (sólo display name; el archivo se queda como `Reels.vue`).
- Texto visible: "Reels"→"Bookmarks", "reel"→"bookmark" (headings, toasts, empty state, placeholders: p.ej. `"Paste a reel URL…"` → `"Paste a bookmark URL…"`).
- Header interno: icono `smart_display` → `bookmark`.
- **Glyph en items**: reemplazar `<img class="thumb" :src="'/reel-thumb.png'">` por `<span class="material-symbols-outlined thumb-glyph">bookmark</span>`. Estilo `.thumb-glyph` con las mismas dimensiones del thumb viejo (48×64), centrado, opacidad reducida.

#### Título abre + marca visto

El `<a class="title" :href="r.url" target="_blank">` actual se convierte en:

```pug
a.title(
  :href="r.url"
  target="_blank"
  rel="noopener"
  @click="toggleSeen(r)"
  :title="r.url") {{ displayTitle(r) }}
```

- Mantiene `target="_blank"` → abre el link en tab nueva (comportamiento nativo del `<a>`).
- `@click="toggleSeen(r)"` dispara el toggle al mismo tiempo (no.preventDefault: dejamos que el `<a>` abra).
- `toggleSeen(r)`: método nuevo que bifurca por `r.seen` — llama `markSeen(r)` si está pendiente, `markUnseen(r)` si está visto. Reusa los métodos existentes (que ya hacen `await api.post/delete(/api/reels/:id/seen)` + refetch).
- El **botón checkmark/undo explícito se conserva** intacto en `.item-actions` (toggle puro, sin abrir nada).
- Caso edge: si la API falla al marcar, el link igual abrió (no lo interceptamos). El toast de error ya lo manejan `markSeen`/`markUnseen`. El refetch posterior corrige el estado visual.

### 2. Frontend — `frontend/src/components/SeriesDetail.vue`

El `<a class="title" :href="itemLink(it)" target="_blank">` actual se convierte en:

```pug
a.title(
  :href="itemLink(it)"
  target="_blank"
  rel="noopener"
  @click="toggleItem(it)") {{ it.title || '(untitled)' }}
```

- `@click="toggleItem(it)"` reusa el método existente (que ya hace toggle visto/no-visto con cascada + refetch).
- Se conserva el `<a class="icon-link">` con `open_in_new` **sólo si** ya existe en esa vista. En SeriesDetail **hoy existe** (`itemLink(it)` con `open_in_new`), así que se mantiene para no romper el affordance explícito de "abrir sin marcar". *(Nota: el usuario pidió "no icono extra" para Bookmarks; en SeriesDetail el icono ya está y removerlo sería un cambio de comportamiento adicional — se deja.)*
- **Aclaración importante:** en SeriesDetail el título ya marcaba vía checkmark con **cascada** (marcar el cap N marca los N-1..1). Al poner el toggle en el título, click en cualquier capítulo dispara la misma cascada. Es el comportamiento esperado y consistente con el checkmark.

### 3. Frontend — `frontend/src/components/SeriesCard.vue`

- `badgeLabel`: `type === 'reel'` sigue retornando la etiqueta nueva `'Bookmarks'` (antes `'Reels'`).
- `showLastRead`: sin cambios (`type !== 'reel'` sigue siendo correcto — el valor interno no cambia).
- Placeholder de portada: agregar computed `placeholderIcon` → retorna `'bookmark'` si `type === 'reel'`, sino `'photo'`. El `<span class="cover-placeholder"><span class="material-symbols-outlined">{{ placeholderIcon }}</span>` lo usa.
- CSS: `.reel` se mantiene como selector interno (mismo color `#fc9` / fondo) — no se renombra la clase porque el valor interno es `'reel'`.

### 4. Frontend — `frontend/src/components/Dashboard.vue`

- Computed `reelsCard` (sin renombrar — `summary.reelsPending` viene del backend y no cambia):
  - `name: 'Reels'` → `name: 'Bookmarks'`.
  - `cover_url: '/reel-thumb.png'` → `cover_url: null` (para que SeriesCard muestre el glyph placeholder `bookmark`).
  - `last_item_title: \`${pending} to watch\`` → `\`${pending} to review\`` (neutral, bookmarks no son "watch").
  - `type: 'reel'` se conserva (id interno).
- Template: el wrapper `.reels-card-wrapper` se deja (clase interna); el `:to="{ path: '/reels' }"` se conserva (la ruta sigue siendo `/reels`).

### 5. Frontend — `frontend/src/components/AppHeader.vue`

- En el `router-link` a `/reels`: icono `smart_display` → `bookmark`; label `Reels` → `Bookmarks`.
- La ruta `/reels` **no cambia** (es id interno; la URL en la barra va a seguir siendo `/reels`). Si se quiere limpiar la URL también, sería un cambio de router — fuera de alcance de esta épica (backend-only rename).

### 6. Frontend — sin cambios

- `router.js`: la ruta `/reels` queda (sigue linkeando a `Reels.vue`).
- `api.js`, `main.js`: sin cambios.
- **No se toca:** `backend/**`, `docs/ARCHITECTURE.md` (schema/rutas/env), `env_example`, smoke tests. La decisión 15+16 sí va a `AGENTS.md` y `PROJECT.md`.

---

## Migración de datos

Ninguna. No se toca backend ni DB.

---

## Tareas

### Frontend
- [x] `Reels.vue`: `name: 'Bookmarks'` + textos visibles "bookmark" + header icon `bookmark` + glyph en items (reemplazo del `<img>`).
- [x] `Reels.vue`: `@click="toggleSeen(r)"` en el `<a class="title">` + método `toggleSeen(r)` (bifurca por `r.seen`).
- [x] `SeriesDetail.vue`: `@click="toggleItem(it)"` en el `<a class="title">` (conserva el `open_in_new` existente).
- [x] `SeriesCard.vue`: `badgeLabel` → `'Bookmarks'` para `type:'reel'`; `placeholderIcon` computed → glyph `bookmark` cuando `cover_url` falte y `type==='reel'`.
- [x] `Dashboard.vue`: `reelsCard.name = 'Bookmarks'`, `cover_url: null`, `last_item_title: '… to review'`.
- [x] `AppHeader.vue`: icono `bookmark` + label "Bookmarks" en el link a `/reels`.

### Doc
- [x] `docs/AGENTS.md`: decisiones 15 y 16.
- [x] `docs/PROJECT.md`: decisiones 15 y 16 + fila de la épica en la tabla.

## Verificación

- [x] En `/reels`: headings y textos dicen "Bookmarks"; items muestran glyph `bookmark` (sin imagen).
- [x] Click en el título de un bookmark → abre la URL en tab nueva **y** lo mueve a "Watched" (o viceversa si ya estaba visto).
- [x] Click en el checkmark → marca/desmarca **sin** abrir nada (toggle puro).
- [x] En detalle de serie: click en el título del capítulo → abre el link **y** marca visto (con cascada como el checkmark); el `open_in_new` sigue abriendo solo.
- [x] Card del dashboard muestra glyph `bookmark` (no `reel-thumb.png`) y dice "Bookmarks" / "N to review".
- [x] Header: link dice "Bookmarks" con icono `bookmark`; la URL sigue siendo `/reels`.
- [x] Backend y smoke tests sin cambios — siguen en verde sin tocarlos.

## Cómo reproducir la verificación

- **Frontend build:** `cd frontend && API=http://localhost:3000 BUILD_OUT_DIR=dist npm run build`.
- **Regresión backend (sin cambios, debe seguir verde):** `cd backend && for t in smoke-auth smoke-data-model smoke-series-crud smoke-imdb-engine smoke-rss-engine smoke-sources smoke-dashboard smoke-series-detail smoke-reels smoke-captcha; do rm -f test.sqlite && DB_PATH=./test.sqlite SECRET=test node tests/$t.mjs; done`.
- **Manual:** levantar dev, abrir `/reels`, pegar una URL → ver el alta (glyph + título), click en el título → abre la URL en tab nueva y el item pasa a "Watched"; click al checkmark → toggle puro. En detalle de serie, click en un capítulo → abre + marca visto (verificar cascada en los anteriores).

---

## Alternativas consideradas

- **Rename completo (tabla `bookmarks`, rutas `/api/bookmarks`, etc.).** Descartado por instrucción del usuario: sólo UI, sin tocar backend/DB. El rename cosmético (precedente Épica 13) logra el objetivo de producto sin costo de migración.
- **Cambiar la URL del router (`/reels` → `/bookmarks`).** Descartado: la URL es un id interno estable (igual que `type:'reel'`). Cambiarla rompería bookmarks de usuarios y links compartidos. Si se quiere limpiar, es trabajo separado.
- **Quitar el checkmark y dejar sólo el título.** Descartado por instrucción del usuario: el checkmark se conserva como toggle puro (marcar sin abrir).
- **Agregar icono `open_in_new` extra en Bookmarks.** Descartado por instrucción del usuario: el título ya abre + marca, no se agrega acción duplicada.
- **Título que marca pero NO abre.** Descartado: el usuario pidió explícitamente "abre el link y lo marca al mismo tiempo".
- **Título que abre pero NO marca (status quo).** Descartado: ese es el comportamiento actual que el usuario quiere cambiar.
- **Quitar el icono `open_in_new` existente en SeriesDetail.** Fuera de alcance: ya está, removerlo es un cambio de UX adicional no pedido. Se deja.

---

## Archivos a modificar

- `frontend/src/components/Reels.vue` (textos, glyph, `toggleSeen` en el título).
- `frontend/src/components/SeriesDetail.vue` (`toggleItem` en el título).
- `frontend/src/components/SeriesCard.vue` (`badgeLabel`, `placeholderIcon`).
- `frontend/src/components/Dashboard.vue` (`reelsCard` name/cover/last_item_title).
- `frontend/src/components/AppHeader.vue` (icon + label).
- `docs/AGENTS.md`, `docs/PROJECT.md` (decisiones 15+16 + fila épica).

## No se modifican

- `backend/**` (cualquier archivo).
- `docs/ARCHITECTURE.md`.
- `env_example`.
- `frontend/src/router.js`, `api.js`, `main.js`.
- Smoke tests.
