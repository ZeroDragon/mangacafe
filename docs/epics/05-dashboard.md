# Épica 5 — Dashboard de actualizaciones

**Estado:** `[DONE]`
**Objetivo:** Pantalla principal post-login que muestra qué series tienen novedades y cuántos capítulos/episodios faltan por ver.

**Depende de:** Épicas 1, 3 (series), 4 (RSS poblado).
**Habilita:** cierre del flujo principal del producto.

---

## Alcance

### Backend
- `GET /api/dashboard` (protegido) → para cada serie del usuario:
  ```json
  {
    "id", "type", "name", "url", "cover_url", "current_chapter", "rss_url",
    "last_error", "last_checked_at",
    "pending": 3,
    "hasUpdates": true,
    "last_item_title": "Capítulo 47",
    "last_item_date": 1780000000,
    "last_item_link": "https://..."
  }
  ```
  + `summary: { totalPending, withUpdates, total }`.
- No bloquea con refresh RSS: lee el estado actual (el scheduler de Épica 4 actualiza en background).
- `POST /api/series/:id/seen-all` — marca todos los pendientes como vistos (ownership → 404).

### Frontend
- `Dashboard.vue` reemplaza al placeholder con:
  - Resumen: "N capítulo(s) pendiente(s) · X serie(s) con novedades".
  - Botón "Refrescar ahora" (`POST /api/refresh`).
  - Grilla de tarjetas con portada, badge de pendientes, icono de error visible y `last_item_title`.
  - Acción "marcar todo visto" por tarjeta.
  - Estados: loading, vacío sin series (CTA), al día (sin pendientes).
  - Auto-fetch al montar.

---

## Tareas

- [x] `GET /api/dashboard` que arme el agregado (JOIN `series` + conteo + último item pendiente).
- [x] No dispara refresh automático (lee estado, el scheduler corre aparte).
- [x] `Dashboard.vue` con grilla + resumen + estados.
- [x] Resumen total arriba.
- [x] Series con `last_error` destacadas (borde rojo + mensaje visible).
- [x] Botón "marcar todo visto" por serie.
- [x] Botón global "refrescar ahora" → `POST /api/refresh`.
- [x] Loading state.
- [x] Estados vacíos (sin series, sin pendientes).

## Verificación

- [x] Con series y items pendientes, el resumen muestra el total correcto.
- [x] Series con `last_error` muestran el error visible (borde + mensaje + badge).
- [x] "Marcar todo visto" deja `pending=0` y actualiza el summary.
- [x] `hasUpdates` correcto (true si `pending>0`).
- [x] `last_item_title` trae el título del último item pendiente.
- [x] Ownership: dashboard de B no incluye series de A.
- [x] Sin token → 401.

## Cómo reproducir la verificación

- **Backend:** `cd backend && node tests/smoke-dashboard.mjs` (crea usuario con 4 series, items, error de feed, y otro usuario para verificar ownership).

## Notas de implementación

- **Agregado SQL:** `dashboardByUser` hace LEFT JOIN con dos subqueries — una para el `pending` count y otra con `MAX(id)` para agarrar el último item pendiente y traer su título/link/fecha en un JOIN adicional. Una sola query por usuario (evita N+1).
- **Orden:** pendientes primero (DESC), luego por `updated_at` DESC — las series con novedades quedan arriba.
- **"Marcar todo visto":** no toca `current_chapter` (no se sabe a qué capítulo avanzar sin parsear el título del item). Avanzar `current_chapter` se hace desde el detalle (Épica 6) por item. El seen-all solo setea `seen=1`.
- **Refresh al cargar:** se decide **no** disparar refresh automático al montar el dashboard para no bloquear el render. El botón "Refrescar ahora" dispara `POST /api/refresh` y luego re-fetch del dashboard.
- **Sin SeriesCard:** se optó por una tarjeta ad-hoc en el dashboard (más densa: badge + error + último item + acciones) en vez de reutilizar `SeriesCard` de Épica 3, que queda para la lista de gestión.
