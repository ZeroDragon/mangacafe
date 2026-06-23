# Épica 13 — Reorganización del header + renombrado de tipos

**Estado:** `[PENDING]`
**Objetivo:** Dos cambios visuales que no tocan el modelo de datos: (1) el header pierde el link directo a Crunchyroll y gana un **menú de usuario** (click sobre el username) que agrupa "Sync Crunchyroll" y "Logout"; (2) las etiquetas visibles de tipos dejan de ser `Anime`/`Manga` y pasan a ser **`Show`/`Graphic novel`** para englobar otras clases de series y comics. Los valores internos de la columna `series.type` (`'anime'`, `'manga'`) **no cambian** — es un rename puramente cosmético de la UI.

**Depende de:** Épica 2 (auth/header), Épica 5 (dashboard/filtros), Épica 3 (SeriesForm).
**Habilita:** una taxonomía más amplia en la UI sin migrar la DB; un header más limpio.

---

## Contexto / motivación

### Menú de usuario

El header actual tiene cuatro links (Dashboard, Series, Crunchyroll, Reels) + botón "New" + username + logout, todo en una fila. En viewports chicos ya colapsa a iconos. El link de Crunchyroll es el menos nav- frecuente (es una herramienta de sincronización on-demand, no una sección que se visita a diario) y compite por espacio con el nombre de usuario. Moverlo bajo el **menú del username** agrupa las acciones de cuenta (logout, sync externo) y libera el nav principal para lo que es contenido (Dashboard, Series, Reels).

### Renombrado de tipos

Manga Café hoy trackea series con `type IN ('manga', 'anime')`, pero los valores son ids internos: nada impide que un usuario trackee una **novela ligera**, un **manhwa**, un **webcomic** o una **serie live-action** bajo el mismo modelo (URL + portada + feed). Las etiquetas "Anime" y "Manga" son restrictivas y no reflejan el uso real. Renombrarlas a **"Show"** y **"Graphic novel"** en la UI es más inclusivo sin tocar la DB ni romper feeds existentes.

### Decisión de producto (nueva — agregar a `AGENTS.md` y `PROJECT.md`)

| # | Decisión | Valor |
|---|----------|-------|
| 12 | Etiquetas de `type` en la UI | La UI muestra **"Show"** para `type='anime'` y **"Graphic novel"** para `type='manga'`. Los valores internos de `series.type` (`'anime'`, `'manga'`) **no cambian** — son ids estables que persisten en la DB, se usan en queries, en el dispatch de feeds (IMDB vs RSS) y en las clases CSS de los badges. El rename es exclusivamente cosmético en la capa de presentación (Épica 13). |

---

## Alcance

### 1. Menú de usuario en el header — `frontend/src/components/AppHeader.vue`

**Quitar del `nav.links`:**
- El `router-link` a `/crunchyroll` (icono `sync` + label "Crunchyroll") desaparece del nav principal.

**Convertir `.user` en un menú desplegable:**

```
.user-menu (click para toggle, no hover — por compatibilidad mobile)
  button.user-trigger (@click="menuOpen = !menuOpen")
    span.material-symbols-outlined person
    span.name {{ username }}
    span.material-symbols-outlined.arrow {{ menuOpen ? 'expand_less' : 'expand_more' }}
  .user-dropdown(v-if="menuOpen")
    router-link(:to="{ path: '/crunchyroll' }" @click="menuOpen = false")
      span.material-symbols-outlined sync
      span Sync Crunchyroll
    button(@click="logout")
      span.material-symbols-outlined logout
      span Logout
```

Detalles:
- **Toggle por click**, no por hover: en mobile no hay hover fiable y `@media (hover: hover)` es frágil. Un estado `menuOpen` en `data()` con `@click` en el trigger es simple y funciona en todos lados.
- **Cerrar al navegar**: cada item del dropdown setea `menuOpen = false` después de la acción.
- **Cerrar al click afuera**: un listener global (`document.addEventListener('click', ...)`) en `mounted`/`beforeUnmount` que cierre el menú si el click no fue dentro del `.user-menu`. Sin esto, el menú queda abierto al navegar o al hacer scroll.
- **Posicionamiento del dropdown**: `position: absolute` bajo el trigger, alineado a la derecha (`right: 0`), con `z-index` alto para no quedar bajo las cards del dashboard.
- **En mobile** (`max-width 560px`): el label del username ya se oculta hoy; el menú sigue funcionando con solo el icono `person` + la flecha. Los items del dropdown **sí** muestran su label completo (el menú es un overlay, no compite por espacio horizontal).

### 2. Renombrado de etiquetas — sin tocar el backend

Todas las ocurrencias de "Anime"/"Manga" como **texto visible** se cambian por "Show"/"Graphic novel". Los valores de `series.type` (`'anime'`, `'manga'`) **permanecen** — son ids internos usados en queries, dispatch de feeds, validación backend y clases CSS.

**Mapeo:**

| Valor interno (`series.type`) | Etiqueta UI actual | Etiqueta UI nueva |
|-------------------------------|--------------------|-------------------|
| `'anime'`                     | Anime              | **Show**          |
| `'manga'`                     | Manga              | **Graphic novel** |

**Archivos afectados (texto visible únicamente):**

| Archivo | Línea | Cambio |
|---------|-------|--------|
| `Dashboard.vue` | `{ key: 'manga', label: 'Manga' }` | `label: 'Graphic novel'` |
| `Dashboard.vue` | `{ key: 'anime', label: 'Anime' }` | `label: 'Show'` |
| `SeriesCard.vue` | `if (series.type === 'anime') return 'Anime'` | `return 'Show'` |
| `SeriesCard.vue` | `if (series.type === 'manga') return 'Manga'` | `return 'Graphic novel'` |
| `SeriesDetail.vue` | `series.type === 'anime' ? 'Anime' : 'Manga'` | `'Show' : 'Graphic novel'` |
| `SeriesForm.vue` | toggle button `Manga` | `Graphic novel` |
| `SeriesForm.vue` | toggle button `Anime` | `Show` |
| `SeriesForm.vue` | placeholder `https://manga-site.com/feed` | genérico (e.g. `https://your-feed-url.com/feed`) |

**Lo que NO cambia:**
- `series.type` en la DB: sigue siendo `'anime'`/`'manga'` (CHECK constraint, dispatch IMDB/RSS, queries).
- Clases CSS `.anime`/`.manga` en los badges y estilos: siguen siendo los selectores internos.
- `validateSeries` en el backend: sigue aceptando `type IN ('manga', 'anime')`.
- `Crunchyroll.vue` asigna `type: 'anime'` al navegar a `/series/new` — es un valor interno, **no** texto visible. Se mantiene.
- Comentarios del código que mencionen "anime"/"manga": se dejan (describen el valor interno, no la UI).
- El **nombre de la marca** "Manga Café" (`AppHeader.vue`, `Login.vue`, `home.vue`): no cambia — es el producto, no una categoría.

### 3. Sin cambios de backend

No hay endpoints nuevos, no hay migración, no hay env vars. Toda la épica es frontend.

### 4. Sin cambios de DB

`series.type` sigue siendo `TEXT CHECK (type IN ('manga', 'anime'))`. Si en el futuro se quiere una tercera categoría real (no un rename cosmético), ahí sí se tocaría la constraint y los dispatches.

---

## Migración de datos

Ninguna. Es un rename de UI puro.

---

## Tareas

### Header
- [ ] `AppHeader.vue`: quitar `router-link` a `/crunchyroll` de `nav.links`.
- [ ] `AppHeader.vue`: convertir `.user` en `.user-menu` con dropdown (toggle por click, close-on-outside-click, close-on-navigate).
- [ ] `AppHeader.vue`: items del dropdown → "Sync Crunchyroll" (`/crunchyroll`) + "Logout".
- [ ] `AppHeader.vue`: estilos del dropdown (absolute, right-aligned, z-index, separadores hover).
- [ ] `AppHeader.vue`: responsive — el menón funciona con solo iconos en mobile.

### Renombrado
- [ ] `Dashboard.vue`: labels de filtros → "Show" / "Graphic novel".
- [ ] `SeriesCard.vue`: `badgeLabel()` → "Show" / "Graphic novel".
- [ ] `SeriesDetail.vue`: type-badge → "Show" / "Graphic novel".
- [ ] `SeriesForm.vue`: toggle buttons → "Show" / "Graphic novel"; placeholder de feed genérico.

### Tests
- [ ] `smoke-series-crud.mjs`: revisar que los asserts que leen etiquetas de UI (si los hay) sigan pasando. Nota: los smoke tests actuales usan los valores internos `'anime'`/`'manga'` (no las etiquetas), así que no deberían romperse — verificar.

## Verificación

- [ ] El nav del header tiene solo: Dashboard, Series, Reels (+ botón "New" + menu usuario).
- [ ] Click sobre el username abre un dropdown con "Sync Crunchyroll" y "Logout".
- [ ] Click fuera del dropdown lo cierra.
- [ ] Navegar a un item del dropdown lo cierra.
- [ ] En mobile (<=560px), el menú se abre con el icono `person` y muestra los items con labels completos.
- [ ] En el dashboard, los filtros dicen "Show" y "Graphic novel" (no "Anime"/"Manga").
- [ ] Las cards de series muestran el badge "Show" o "Graphic novel".
- [ ] El detalle de serie muestra el badge correcto.
- [ ] El formulario de alta/edición tiene toggles "Show" / "Graphic novel".
- [ ] El backend sigue aceptando `type: 'anime'`/`'manga'` (no cambió la validación).
- [ ] El card de Reels en el dashboard sigue mostrando el badge "Reels" (no afectado).

## Cómo reproducir la verificación

- **Backend (regresión):** `cd backend && DB_PATH=./test.sqlite SECRET=test node tests/smoke-series-crud.mjs` — debe seguir pasando (usa valores internos, no etiquetas).
- **Frontend build:** `cd frontend && API=http://localhost:3000 BUILD_OUT_DIR=dist npm run build`.
- **Manual:** levantar dev, verificar header (menu toggle), dashboard (labels de filtros y badges), formulario (toggles), detalle (badge).

---

## Alternativas consideradas

- **Renombrar también los valores internos de `series.type`** (e.g. `'show'`/`'graphic_novel'`). Descartado: requeriría migración de datos, cambiar el CHECK constraint, actualizar todos los queries, el dispatch de feeds (`refresher.mjs`), la validación del backend y los smoke tests. El rename cosmético logra el objetivo (UI más inclusiva) sin ese costo ni riesgo.
- **Agregar una tercera categoría real** (e.g. `'novel'` para novelas ligeras). Descartado por ahora: el modelo actual (URL + portada + feed RSS) ya cubre novelas bajo `type='manga'` ("Graphic novel"). Si se necesita un dispatch de feed distinto, ahí sí se justifica un tercer valor.
- **Menú de usuario por hover (`@media (hover: hover)`)**. Descartado: mobile no tiene hover, y mezclar hover/desktop + click/mobile duplica la lógica. Click-to-toggle funciona en ambos.
- **Mover también el botón "New" al menú de usuario.** Descartado: "New" es la acción más frecuente (dar de alta series); ocultarla bajo un menú suma un click innecesario. Se mantiene visible.
- **Renombrar el placeholder del feed de manga** a algo como `https://graphic-novel-site.com/feed`. Descartado: un placeholder con guion se ve raro y "graphic-novel-site.com" no es másclare que "your-feed-url.com". Se usa un placeholder genérico neutro.

---

## Archivos a modificar

- `frontend/src/components/AppHeader.vue` (dropdown de usuario + quitar link Crunchyroll).
- `frontend/src/components/Dashboard.vue` (labels de filtros).
- `frontend/src/components/SeriesCard.vue` (`badgeLabel`).
- `frontend/src/components/SeriesDetail.vue` (type-badge).
- `frontend/src/components/SeriesForm.vue` (toggle buttons + placeholder).
- `docs/AGENTS.md` y `docs/PROJECT.md` (decisión 12 + fila en la tabla de épicas).
