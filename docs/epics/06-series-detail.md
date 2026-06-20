# Épica 6 — Detalle de serie

**Estado:** `[PENDING]`
**Objetivo:** Vista por serie con el historial de items (pendientes y vistos), links directos para abrir el episodio, y acciones de edición/eliminación.

**Depende de:** Épicas 1, 3, 4.
**Habilita:** experiencia completa por serie.

---

## Alcance

### Backend
- `GET /api/series/:id/feed` (protegido + ownership) → items ordenados por `pub_date` desc, con flag `seen`.
- Reutilizar `PUT /api/series/:id` y `DELETE /api/series/:id` de Épica 3 para editar/eliminar.
- `POST /api/series/:id/items/:itemId/seen` — marcar un item como visto.
- `POST /api/series/:id/seen-all` — marcar todos los pendientes como vistos.

### Frontend
- `SeriesDetail.vue` en ruta `/series/:id`:
  - Cabecera: portada, nombre, tipo, URL ("abrir donde lo leo/veo"), capítulo actual, estado del RSS (`last_checked_at`, `last_error`).
  - Lista cronológica de items con: título, fecha, link "abrir", botón "marcar visto".
  - Acciones: editar (lleva a `SeriesForm`), eliminar (con confirmación), refrescar RSS ahora.

---

## Tareas

- [ ] Endpoint `GET /api/series/:id/feed`.
- [ ] Endpoint `POST /api/series/:id/items/:itemId/seen`.
- [ ] Endpoint `POST /api/series/:id/seen-all`.
- [ ] `SeriesDetail.vue` con cabecera + lista de items.
- [ ] Link "abrir" en cada item → nueva pestaña a `item.link` (o a `series.url` si no hay link específico).
- [ ] Al abrir un item, ofrecer marcarlo visto automáticamente (opcional, configurable).
- [ ] Botón refrescar RSS que llama a `POST /api/series/:id/refresh` (Épica 4).
- [ ] Mostrar `last_error` prominente si existe, con CTA a editar el `rss_url`.
- [ ] Confirmación de eliminación con feedback.

## Verificación

- [ ] La lista muestra items en orden cronológico.
- [ ] Marcar un item visto lo saca de pendientes (o lo tacha, según UI).
- [ ] "Seen-all" deja el conteo en 0.
- [ ] Ownership: detalle de serie ajena → 404/403.
- [ ] Eliminar redirige al dashboard.

## Notas

- Si una serie no tiene RSS, la sección de items queda vacía con un CTA "agregá un feed RSS para seguimiento automático".
- Considerar atajo de teclado para "abrir y marcar visto" en desktop.
