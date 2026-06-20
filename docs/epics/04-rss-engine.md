# Épica 4 — Motor RSS

**Estado:** `[PENDING]`
**Objetivo:** Refrescar feeds RSS de las series, deduplicar items y mantener actualizado el conteo de pendientes y los errores visibles.

**Depende de:** Épica 1 (tablas `series` + `series_items`).
**Habilita:** Épicas 5, 6 (necesitan datos de RSS para mostrar).

---

## Alcance

### Parser
- Usar `xml2js` (ya en deps) para parsear el feed, **o** evaluar `rss-parser` si simplifica. Decisión inicial: `xml2js` para no agregar deps.
- Normalizar RSS 2.0 y Atom mínimamente (`<item>` / `<entry`>).

### Refresco de una serie (`refreshSeries(series)`)
1. Si `rss_url` es NULL, salir.
2. Fetch HTTP del feed (con `axios`, ya en deps, y un `User-Agent` + timeout configurables por env).
3. Parsear items → `{ guid, title, link, pub_date }`.
4. Insertar con `series_item.insertMany` (dedupe por `UNIQUE(series_id, guid)`).
5. Actualizar `series.last_known_total`, `last_checked_at = now`, `last_error = NULL`.
6. En fallo: setear `series.last_error = mensaje` (decisión 7), NO reventar el job entero.

### Scheduler
- **Producción:** cada 6h (decisión 5). Opciones:
  - Ajustar `cron_restart` de PM2 a `0 */6 * * *` (reinicia el proceso y corre un refresh-all al boot).
  - **Preferido:** `setInterval` o `node-cron` interno que recorra todas las series con `rss_url` no NULL y `last_checked_at` viejo.
- **Desarrollo (on-demand):** endpoint `POST /api/refresh` (protegido) que dispara el refresco de todas las series del usuario (o de una en particular vía `POST /api/series/:id/refresh`). Debe responder cuando termine o aceptar un flag `?wait=true`.

---

## Tareas

- [ ] Crear `backend/src/rss.mjs` con `parseFeed(xml)` → array de items normalizados.
- [ ] Crear `backend/src/refresher.mjs` con `refreshSeries(series)` y `refreshAll()` (recorre series con RSS).
- [ ] Decidir estrategia cron (preferido: scheduler interno con `setInterval` cada 6h + job al boot).
- [ ] Endpoint `POST /api/refresh` (on-demand, dev) con `[verifyToken, getUser]`.
- [ ] Endpoint `POST /api/series/:id/refresh` para refrescar una sola serie.
- [ ] Manejo de errores: timeouts, 4xx/5xx del origen, XML inválido → `last_error` con mensaje útil.
- [ ] Env vars nuevas: `RSS_USER_AGENT`, `RSS_TIMEOUT` (documentarlas en `env_example` y `ARCHITECTURE.md`).
- [ ] Rate limit / delays entre fetches para no ser baneado (p.ej. 1 req cada N ms).

## Verificación

- [ ] Serie con feed de prueba (p.ej. un RSS de un blog estable) → al refrescar, `series_items` se llena y `pendingCount > 0`.
- [ ] Segundo refresco no duplica items (dedupe por guid).
- [ ] Feed inexistente/inválido → `last_error` poblado, sin crash.
- [ ] Serie sin `rss_url` → no se refresca ni marca error.
- [ ] `POST /api/refresh` on-demand devuelve resultado y actualiza `last_checked_at`.

## Notas

- **User-Agent:** algunos sitios bloquean requests sin UA; usar uno realista configurable.
- **pub_date:** parsear fechas RFC822 / ISO a epoch; si no viene, usar `created_at`.
- **guid fallback:** si el item no trae `<guid>`, usar `link` (o hash de title+pub_date).
- El conteo de pendientes se obtiene de Épica 1; aquí solo se insertan items nuevos.
