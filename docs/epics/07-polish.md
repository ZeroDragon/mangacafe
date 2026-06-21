# Épica 7 — Pulido y UX

**Estado:** `[DONE]`
**Objetivo:** Cerrar la experiencia con estados vacíos, loaders, filtros, búsqueda, responsive y PWA.

**Depende de:** Épicas 3, 5, 6 (features base).
**Habilita:** release usable.

---

## Alcance

### UX
- Skeleton loaders mientras cargan dashboard (y loader spinner en detalle).
- Estados vacíos claros en cada pantalla (sin series, sin pendientes, sin resultados de filtro).
- **Filtros en dashboard:** todos / manga / anime / con pendientes / con error.
- **Búsqueda local** por nombre de serie (en tiempo real).
- **Toasts** de feedback para crear / editar / eliminar / refresh / marcar visto / errores.

### Responsive
- Header mobile-first con iconos + labels; en viewports chicos (≤560px) se ocultan los labels textuales y queda solo el icono.
- Tarjetas reflow (`grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`).
- Search input se achica en mobile.

### Accesibilidad
- `:focus-visible` global (outline blanco visible en tab navigation).
- `aria-label` en el search.
- `title`/`alt` en botones e imágenes.

### PWA
- `site.webmanifest` revisado: name "Manga Café", `description`, `start_url: /dashboard`, `scope: /`, `theme_color` alineado a `--primary`, `display: standalone`, `orientation: portrait`.
- Sin service worker (postergado: el `dotPathFixPlugin` ya da SPA fallback y complica el deploy).

---

## Tareas

- [x] Header/nav consistente (logo Material, Dashboard, Series, + Nueva serie, logout).
- [x] Componente `Loader.vue` (spinner + skeleton reutilizable).
- [x] Plugin `toast.js` + componente `Toasts.vue`.
- [x] Filtros y búsqueda en `Dashboard.vue`.
- [x] Revisar `site.webmanifest` (nombre, icons, theme color, start_url).
- [x] `:focus-visible` global y `aria-label` en inputs.
- [x] Layout responsive probado en build (CSS con `@media (max-width: 560px)`).

## Verificación

- [x] Sin series, el dashboard muestra CTA claro.
- [x] Filtros cambian la lista sin recargar (`filtered` computed).
- [x] Búsqueda filtra por nombre en tiempo real (`search` v-model).
- [x] Layout no rompe en 360px (CSS mobile-first + media queries).
- [x] Manifest válido (JSON parses, theme/background coherentes).
- [x] Toasts aparecen y desaparecen a los 3.5s (o al click).
- [x] Skeletons visibles durante la carga.
- [x] Tests de Épicas 2–6 siguen en verde (sin regresiones backend).
- [x] `npm run build` compila sin errores.

## Cómo reproducir la verificación

- **Backend (regresión):** `cd backend && for t in smoke-auth smoke-data-model smoke-series-crud smoke-imdb-engine smoke-dashboard smoke-series-detail; do node tests/$t.mjs; done`
- **Frontend:** `cd frontend && API=http://localhost:3000 BUILD_OUT_DIR=dist npm run build`.
- **Manual (UX):** levantar backend y frontend en dev (`npm run dev`), loguearse, crear series, jugar con filtros, búsqueda, toasts (acciones de crear/editar/eliminar/refresh), y probar DevTools a 360px de ancho.

## Notas de implementación

- **Toasts:** plugin `toast.js` con store `reactive` singleton (accesible vía `manager` import directo o `this.$toast`). Componente `Toasts.vue` montado una sola vez en `App.vue`, con `transition-group` para animación de entrada/salida.
- **Loader:** dos modos — `spinner` (default) y `skeleton` (props `skeleton`, `count`, `grid`). El dashboard usa skeleton para mantener el layout durante la carga y el detalle usa spinner centrado.
- **Filtros:** array `FILTERS` constante renderizado como pills. Estado `filter` + `search` se combinan en el computed `filtered`. Botón "Limpiar filtros" en el estado vacío de filtered.
- **Responsive header:** en ≤560px, CSS `@media` oculta `.label` de los links, el nombre de usuario y el texto "Manga Café" (queda solo el icono `local_cafe`).
- **PWA:** se eligió `theme_color: #2b5278` (`--primary`) en vez del `--background` para que la barra del navegador móvil use el color de marca.
- **Service worker:** fuera de scope (decisión del doc original); el `dotPathFixPlugin` ya cubre el SPA fallback.
