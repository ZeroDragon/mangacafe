# Épica 3 — CRUD de series

**Estado:** `[DONE]`
**Objetivo:** Permitir al usuario crear, listar, editar y eliminar sus series (manga o anime) con nombre, URL, portada, capítulo actual y RSS opcional.

**Depende de:** Épica 1 (modelos de datos).
**Habilita:** Épicas 4 (necesita series para probar RSS), 5, 6.

---

## Alcance

### Backend
Endpoints REST protegidos con `[verifyToken, getUser, resolveUserId]`, todos filtrando por `res.userId` → `user_id`:
- `GET    /api/series` — lista del usuario (con `pending` count por LEFT JOIN).
- `POST   /api/series` — crea.
- `GET    /api/series/:id` — detalle (validar ownership → 404 si no es del usuario).
- `PUT    /api/series/:id` — actualiza campos (partial update).
- `DELETE /api/series/:id` — elimina (CASCADE borra items).

### Frontend
- `SeriesForm.vue` — crear/editar: tipo (manga/anime), nombre, URL, cover_url, capítulo actual, rss_url opcional.
- `SeriesList.vue` — grilla de `SeriesCard` con portada, capítulo actual, badge de pendientes.
- `SeriesCard.vue` — tarjeta reutilizable con acciones edit/delete.
- Rutas: `/series`, `/series/new`, `/series/:id/edit`.

---

## Tareas

- [x] Resolver `user_id` desde `res.username` (middleware `resolveUserId` que consulta `user.getBy('username', ...)`). El token sigue llevando solo `username` (decisión de Épica 2).
- [x] En `backend/src/index.mjs`, exponer los 5 endpoints bajo `/api/series`.
- [x] Validación de input: `type ∈ {manga,anime}`, `name` no vacío, URLs con formato `http(s)`, `current_chapter ≥ 0`. Partial validation en PUT.
- [x] Ownership check en GET/PUT/DELETE: la serie pertenece al `user_id` (vía cláusula `WHERE user_id = ?` en el modelo).
- [x] `SeriesForm.vue` con validación cliente básica.
- [x] `SeriesList.vue` que consume `GET /api/series` y renderiza `SeriesCard`.
- [x] Confirmación (`confirm()`) antes de eliminar.
- [x] Estados vacíos ("Aún no tenés series, agregá una").

## Verificación

- [x] Crear serie → aparece en `GET /api/series`.
- [x] Usuario A no puede ver/editar/eliminar serie de usuario B (404).
- [x] Editar campos persiste.
- [x] Eliminar borra la serie (y sus items por CASCADE).
- [x] `type` inválido rechazado (400).
- [x] `current_chapter` negativo rechazado (400).
- [x] URLs inválidas rechazadas (400).
- [x] Sin token → 401; token inválido → 403.
- [x] Token rotado en cada respuesta protegida.

## Cómo reproducir la verificación

- **Backend (HTTP):** `cd backend && node tests/smoke-series-crud.mjs` (levanta la app en un puerto efímero, crea dos usuarios y cubre todo el CRUD + ownership + validaciones + rotación de token).
- **Frontend:** `cd frontend && API=http://localhost:3000 BUILD_OUT_DIR=dist npm run build` compila sin errores.

## Notas de implementación

- **`resolveUserId`:** como el token JWT solo lleva `username` (payload `{ meta: { username } }`), se añadió un middleware que resuelve `user_id` consultando la BD una vez por request protegida y lo cuelga de `res.userId`. Alternativa descartada: añadir `userId` al payload del token (requeriría reemitir tokens y migrar `auth.mjs`); se deja nota para Épica 7/8 si el cost de la query extra molesta.
- **`index.mjs` refactor:** se exportó `app` y se guardó el `app.listen()` bajo `if (isMain)` usando `fileURLToPath(import.meta.url)` para que el smoke test pueda importar la app sin levantar el servidor (puerto 3000). Cuando se ejecuta con `npm start`, escucha normalmente.
- **`series.listByUser`:** ahora hace LEFT JOIN con un subselect de `series_items` (where `seen = 0`) para devolver `pending` en la misma query que la lista — evita N+1 desde el frontend y deja el badge listo para Épica 5.
- **Validación backend:** `validateSeries(body, partial)` centraliza las reglas. En POST exige `type` y `name`; en PUT solo valida los campos presentes. Mensajes en español, concatenados por `; ` en el `error` del 400.
- **404 vs 403 en ownership:** se eligió **404** (no "403 forbidden") para no revelar la existencia de un recurso ajeno. El modelo filtra siempre por `user_id` y el handler mapea `not found or not owned` → 404.
- **Trim de `name`:** el backend trimea `name` antes de insertar; el frontend también. Verificado en el smoke test (`' One Punch Man '` → `'One Punch Man'`).
- **`cover_url`:** como el `img` puede romperse (URL externa caída), `SeriesCard` tiene `@error` que oculta el `<img>` y deja el placeholder (decisión 3: solo URL externa).

## Notas / decisiones

- La portada es **URL externa** (decisión 3): no subir archivo, solo guardar `cover_url` y renderizar con `<img :src>`.
- El badge de pendientes ya lee `pending` del modelo (LEFT JOIN en `listByUser`); muestra 0 mientras no haya items (Épica 4 los puebla).
- `Dashboard.vue` quedó como placeholder con un CTA a `/series` hasta que llegue la Épica 5.
