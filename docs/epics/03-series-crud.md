# Épica 3 — CRUD de series

**Estado:** `[PENDING]`
**Objetivo:** Permitir al usuario crear, listar, editar y eliminar sus series (manga o anime) con nombre, URL, portada, capítulo actual y RSS opcional.

**Depende de:** Épica 1 (modelos de datos).
**Habilita:** Épicas 4 (necesita series para probar RSS), 5, 6.

---

## Alcance

### Backend
Endpoints REST protegidos con `[verifyToken, getUser]`, todos filtrando por `res.username` → `user_id`:
- `GET    /api/series` — lista del usuario.
- `POST   /api/series` — crea.
- `GET    /api/series/:id` — detalle (validar ownership).
- `PUT    /api/series/:id` — actualiza campos.
- `DELETE /api/series/:id` — elimina (CASCADE borra items).

### Frontend
- `SeriesForm.vue` — crear/editar: tipo (manga/anime), nombre, URL, cover_url, capítulo actual, rss_url opcional.
- `SeriesList.vue` — tarjetas con portada, capítulo actual, badge de pendientes.
- `SeriesCard.vue` — tarjeta reutilizable.
- Rutas: `/series/new`, `/series/:id/edit`.

---

## Tareas

- [ ] Resolver `user_id` desde `res.username` (helper `user.getBy('username', res.username)` o caché). Considerar añadir `userId` al payload del token en Épica 2.
- [ ] En `backend/src/index.mjs` (o nuevo `routes/series.mjs`), exponer los 5 endpoints.
- [ ] Validación de input: `type ∈ {manga,anime}`, `name` no vacío, URLs con formato, `current_chapter ≥ 0`.
- [ ] Ownership check en GET/PUT/DELETE: la serie pertenece al `user_id`.
- [ ] `SeriesForm.vue` con validación cliente básica.
- [ ] `SeriesList.vue` que consume `GET /api/series` y renderiza `SeriesCard`.
- [ ] Confirmación antes de eliminar.
- [ ] Estados vacíos ("aún no tenés series, agregá una").

## Verificación

- [ ] Crear serie → aparece en `GET /api/series`.
- [ ] Usuario A no puede ver/editar/eliminar serie de usuario B (404 o 403).
- [ ] Editar campos persiste.
- [ ] Eliminar borra la serie (y sus items por CASCADE).
- [ ] `type` inválido rechazado.

## Notas

- La portada es **URL externa** (decisión 3): no subir archivo, solo guardar `cover_url` y renderizar con `<img :src>`.
- El badge de pendientes en la tarjeta requiere Épica 4/1; puede mostrarse en 0 mientras tanto o leer `pendingCount` del modelo si Épica 1 ya lo expone.
