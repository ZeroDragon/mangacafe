# Épica 6 — Detalle de serie

**Estado:** `[DONE]`
**Objetivo:** Vista por serie con el historial de items (pendientes y vistos), links directos para abrir el episodio, y acciones de edición/eliminación.

**Depende de:** Épicas 1, 3, 4.
**Habilita:** experiencia completa por serie.

---

## Alcance

### Backend
- `GET /api/series/:id/feed` (protegido + ownership) → items ordenados por `pub_date` DESC, con flag `seen`. Soporta `?pending=1`.
- `POST /api/series/:id/items/:itemId/seen` — marcar un item como visto (ownership check vía JOIN con `series.user_id`).
- `POST /api/series/:id/seen-all` — marcar todos los pendientes (definido en Épica 5, ahora con ownership estricto).
- Reutiliza `PUT /api/series/:id`, `DELETE /api/series/:id` (Épica 3) y `POST /api/series/:id/refresh` (Épica 4).

### Frontend
- `SeriesDetail.vue` en ruta `/series/:id`:
  - Cabecera: portada, nombre, tipo, badge de pendientes, URL "abrir donde lo leo/veo", capítulo actual, estado del RSS (`last_checked_at`, `last_error`).
  - Lista cronológica (más reciente primero) con: título, fecha, link "abrir", botón "marcar visto". Items vistos se tachan y atenúan.
  - Acciones: refrescar RSS, marcar todo visto, editar (lleva a `SeriesForm`), eliminar (con confirmación).

---

## Tareas

- [x] Endpoint `GET /api/series/:id/feed` (con `?pending=1`).
- [x] Endpoint `POST /api/series/:id/items/:itemId/seen` (ownership).
- [x] Endpoint `POST /api/series/:id/seen-all` (ownership estricto).
- [x] `SeriesDetail.vue` con cabecera + lista de items.
- [x] Link "abrir" en cada item → nueva pestaña a `item.link` (o `series.url` fallback).
- [x] Botón refrescar RSS que llama a `POST /api/series/:id/refresh`.
- [x] `last_error` prominente si existe, con CTA a editar el `rss_url`.
- [x] Confirmación de eliminación con redirección a `/series`.
- [x] Estado vacío cuando no hay items (CTA a refrescar o a agregar RSS).

## Verificación

- [x] La lista muestra items en orden cronológico DESC.
- [x] Marcar un item visto lo saca de `?pending=1` y se tacha en la UI.
- [x] "Seen-all" deja el conteo en 0.
- [x] Ownership: detalle/feed/seen/seen-all de serie ajena → 404.
- [x] Ownership a nivel item: A no puede marcar un item cuya serie pertenece a B (JOIN `series.user_id`).
- [x] Item inexistente → 404.
- [x] Eliminar redirige a `/series`.

## Cómo reproducir la verificación

- **Backend:** `cd backend && node tests/smoke-series-detail.mjs` (cubriendo feed, item-seen con ownership, seen-all con ownership, items inexistentes, 401/404).

## Notas de implementación

- **Ownership estricto en `markSeen`:** antes solo validaba `id`, ahora hace `WHERE id = ? AND series_id IN (SELECT id FROM series WHERE user_id = ?)`. Ajuste retroactivo necesario para que A no pueda tocar items de B incluso sabiendo el `itemId`.
- **Lo mismo en `markAllSeen`:** se añadió el subselect por `user_id` para no depender solo del `series_id` del path (que ya estaba validado en el handler, pero defense-in-depth en el modelo).
- **Sin `markSeenUpTo` en esta épica:** el modelo lo expone (de Épica 1) pero la UI usa por-item y seen-all. Queda disponible para un futuro "marcar visto hasta aquí".
- **Fallback de link:** si un item no tiene `link`, el "abrir" usa `series.url`. Si tampoco hay, no se renderiza como link.
- **Series sin RSS:** muestran CTA a editar para agregar feed (decisión 7: error visible; acá, ausencia visible).
- **Redirección 404:** si la serie no existe o es ajena, el frontend redirige a `/series` (no mostramos 404 al usuario final).
