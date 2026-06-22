# Épica 10 — Indicador de "último leído/visto" como string

**Estado:** `[DONE]`
**Objetivo:** Eliminar `series.current_chapter` (entero manual que **nunca** se actualizaba al marcar items vistos y no se usa para nada — el conteo de pendientes sale directo de `series_items.seen`) y reemplazarlo por `series.last_read`: un **string** que guarda el `title` del último item visto, recalculado automáticamente en cada operación de visto/no-visto. Nullable para representar "sin datos" cuando la serie todavía no tiene ningún item marcado.

**Depende de:** Épicas 1 (modelo `series`/`series_items`), 6 (detalle + `markSeen`/`markUnseen`/`markAllSeen`).
**Habilita:** que el dashboard, la lista de series y el detalle muestren un indicador de progreso real ("último leído: Cap 103") en vez de un número estático que se desfasa.

---

## Contexto / motivación

Hoy el indicador de progreso es `series.current_chapter INTEGER NOT NULL DEFAULT 0`. Es un número que el usuario setea a mano en `SeriesForm.vue` y que **ningún flujo** actualiza solo:

- `markSeen` / `markUnseen` / `markSeenUpTo` / `markAllSeen` solo tocan `series_items.seen`. Nunca escriben `series`.
- El conteo de pendientes (lo único que el app realmente usa) sale de `COUNT(*) FROM series_items WHERE seen = 0`. **No** depende para nada de `current_chapter`.
- El formulario (`SeriesForm.vue`) pide "Current chapter" como `type="number"`, y el prefill de Crunchyroll manda `current_chapter: it.episode` (un número de episodio de CR).

Resultado: `current_chapter` es **dato zombie** — se guarda, se pide al usuario y nunca alimenta ninguna decisión del app. Se elimina por completo.

El problema de fondo: **los items no traen una relación confiable entre el número y el nombre/dato** (título del feed RSS, título del episodio de IMDB, número de Crunchyroll, etc.). Avanzar un "capítulo número N" no casa con ningún identificador estable del item. Por eso `current_chapter` como entero es una pérdida: o bien se desfasa, o bien obliga al usuario a mantenerlo a mano.

La solución acordada: dejar de trackear un **número** y pasar a trackear el **`title` del último item visto** (tal cual se muestra en el listado del detalle). Como string, permite mostrar directamente ese título. Nullable ⇒ "no hay nada leído todavía" ⇒ se muestra como **"No data"**.

### Decisión de producto (nueva — agregar a `AGENTS.md` y `PROJECT.md`)

| # | Decisión | Valor |
|---|----------|-------|
| 9 | Indicador de progreso | El "último leído/visto" es el **`title` del último item visto** guardado en `series.last_read` (**string, nullable**), no un número de capítulo manual. Se recalcula solo al marcar items visto/no-visto. `NULL` ⇒ se muestra como **"No data"** (Épica 10). |

---

## Alcance

### 1. Modelo de datos — `backend/src/models/db.mjs`

- Agregar columna `series.last_read TEXT` (nullable, sin default).
- **Eliminar** columna `series.current_chapter` (dato zombie: el conteo de pendientes viene de `series_items.seen`, no se usa para nada).
  - Bases nuevas: el `CREATE TABLE series` incluye `last_read TEXT` y **omite** `current_chapter`.
  - Bases existentes: dos migraciones idempotentes en el bloque `ready` de `db.mjs` (mismo patrón que las de la Épica 9, que ya corren en producción):
    - `addColumnIfMissing('series', 'last_read', 'TEXT')`
    - `dropColumnIfExists('series', 'current_chapter')` — **nuevo helper**, análogo a `addColumnIfMissing`. SQLite soporta `ALTER TABLE … DROP COLUMN` desde **3.35.0** (marzo 2021); verificado que el backend corre **3.44.2** en runtime (`sqlite3@5.1.7`). Al desplegar, la migración corre sola en el primer boot (PM2 restart) y elimina la columna — no hace falta intervención manual ni script aparte.
- **No hay backfill** de `current_chapter → last_read`: el entero viejo no mapea a ningún `title` de `series_items`. Toda serie arranca con `last_read = NULL` ⇒ "No data" hasta que el usuario marque un item visto.

### 2. Modelo `series.mjs`

- `ALLOWED_FIELDS`: **sacar** `current_chapter`, **agregar** `last_read`.
- `create(userId, { ... })`: deja de recibir `current_chapter`; recibe `last_read` (default `null`). El `INSERT` lista `last_read` (sin el `|| 0` que tenía el entero, queda `null` si no viene).
- No hace falta un setter dedicado: `update(id, userId, { last_read })` ya queda cubierto por el whitelist.

### 3. Recálculo automático — `backend/src/models/series_item.mjs`

- Nuevo helper `recomputeLastRead(seriesId)`:
  ```sql
  -- title del item visto "más reciente" según el mismo orden que el feed
  -- (pub_date DESC, created_at DESC, id DESC). NULL si no hay ninguno visto.
  SELECT title FROM series_items
  WHERE series_id = ? AND seen = 1
  ORDER BY pub_date DESC, created_at DESC, id DESC
  LIMIT 1
  ```
  y luego `UPDATE series SET last_read = ?, updated_at = strftime('%s','now') WHERE id = ?`. Devuelve `{ last_read }`.
- Llamar a `recomputeLastRead(seriesId)` **al final** de cada mutación de `seen`:
  - `markSeen(itemId, userId)` — tras el `UPDATE ... SET seen = 1` en cascada. (`seriesId` se obtiene del subselect que ya hace el handler.)
  - `markUnseen(itemId, userId)` — tras el `UPDATE ... SET seen = 0` en cascada.
  - `markSeenUpTo(seriesId, itemId)` — tras marcar.
  - `markAllSeen(seriesId, userId)` — tras marcar todos (queda el title del último item por orden).
  - Importante: el `seriesId` siempre se conoce en el handler (viene del path o del subselect), así que el recálculo es por serie y respeta ownership indirectamente (las mutaciones ya validaron ownership).
- **No** tocar `insertMany` ni `deleteFuture`: agregar/borrar items no cambia cuál fue el último *visto* en sí (ver §Edge cases para el caso borde donde se borra justo ese item).

### 4. Dashboard / Detalle — `series_item.mjs` + `index.mjs`

- `GET /api/series/:id`: ya devuelve `series.*` (incluye `last_read`). OK sin cambios.
- `GET /api/dashboard`: al `items.map(s => ({ ... }))` agregar `last_read: s.last_read` y **sacar** `current_chapter`. No hace falta JOIN extra: el `title` ya vive en `series.last_read` (escrito por `recomputeLastRead`), así que el dashboard lo lee directo de la columna. La query `dashboardByUser` **no** necesita modificarse (ya hace `SELECT s.*`).
- `GET /api/series` (lista): `listByUser` se enriquece con un LEFT JOIN adicional (análogo al de `dashboardByUser`) para traer `last_item_title`/`last_item_link`/`last_item_date` del último item **pendiente**. Así la lista de series y el dashboard exponen el mismo contrato de datos y `SeriesCard` puede renderizar igual en ambos contextos.
- `SeriesDetail.vue`, `SeriesCard.vue`: leen `series.last_read` y `series.last_item_title` directamente. Ver §Frontend.

### 5. Validación — `backend/src/index.mjs`

- `validateSeries(body, partial)`:
  - **Quitar** el bloque `if (has('current_chapter'))` (validación numérica `>= 0`).
  - **Agregar** validación de `last_read`: si viene, debe ser `string` o `null` (rechazar números/objetos).
  - En `PUT`, si el body trae `current_chapter` (cliente viejo cacheado), **ignorarlo silenciosamente** para no romper clientes.
- `POST /api/series` y `PUT /api/series/:id`: el `payload`/`fields` lleva `last_read` (default `null`) en vez de `current_chapter`.

### 6. Frontend

- `SeriesForm.vue`:
  - **Quitar** el input "Current chapter" (`type="number"`). El progreso ahora se autogestiona desde el detalle (marcar items vistos). Dejar un note corto: "Progress is tracked automatically as you mark chapters seen".
  - `data().form`: sacar `current_chapter`, no agregar nada (no se manda `last_read` desde el form; es derivado).
  - `validate()`: sacar la regla de `current_chapter >= 0`.
  - `submit()`: el `payload` ya no incluye `current_chapter`.
  - `prefillFromQuery()`: ignorar `q.current_chapter` (lo manda el flujo viejo de Crunchyroll; ver §Crunchyroll).
  - `load()` (edit): ya no precarga `current_chapter`.
- `SeriesDetail.vue`:
  - `.chapter Current chapter: {{ series.current_chapter }}` → `.last-read Last read: {{ series.last_read || 'No data' }}`.
  - `toggleItem`: ahora llama `loadSeries()` junto con `loadFeed()` tras cada mutación (Promise.all), para que `last_read` se muestre **en vivo** sin necesitar refresh manual. Antes solo recargaba el feed; la cabecera quedaba stale hasta el siguiente `loadSeries()`.
- `DashCard.vue` y `SeriesCard.vue` se **unifican** en un único componente `SeriesCard.vue`. Antes eran dos tarjetas casi idénticas con info inconsistente (el dashboard mostraba "Latest" si había pendientes, la lista mostraba solo "Last read"). Ahora:
  - `SeriesCard.vue` siempre muestra las **dos** líneas: `Latest: <último pendiente>` (solo si `pending > 0`) y `Last read: <last_read || 'No data'>`.
  - Props `showEdit` (bool) y `showMarkSeen` (bool) controlan qué acciones mostrar: `SeriesList` pasa `:show-edit="true"`, `Dashboard` pasa `:show-mark-seen="true"`.
  - Emits: `edit`, `delete`, `mark-seen` (cada uno solo se emite desde el botón que el prop habilita).
  - `DashCard.vue` se elimina por completo.
- `Crunchyroll.vue` (`addToSeries`):
  - Sacar `current_chapter: it.episode != null ? it.episode : 0` del `query`. El número de episodio de Crunchyroll **no** es un `title` y no mapea a ningún `series_items`; la serie se crea con `last_read = null` ⇒ "No data" hasta que el usuario marque items vistos tras el primer refresh del feed IMDB.

### 7. Edge cases / "No data"

- **Serie recién creada (sin feed o sin items aún):** `last_read = NULL` ⇒ **"No data"**.
- **Serie con feed e items, pero ninguno marcado visto:** `last_read = NULL` ⇒ **"No data"**.
- **Se desmarca el último item visto** (`markUnseen` deja 0 vistos): `recomputeLastRead` devuelve `NULL` ⇒ **"No data"**.
- **`last_read` quedó con un `title` cuyo item ya no existe** (borrado por `deleteFuture` o porque el feed cambió entre fetches): el string guardado sigue válido para mostrar — el usuario lo reconoció como "último leído" en su momento. Se repara al próxima mutación de `seen` (que recomputea contra lo que sí existe). No es un error; es degradación graceful. Si se quisiera ser más estricto, se podría llamar `recomputeLastRead` desde `deleteFuture`, pero no es necesario para esta épica.
- **Item visto cuyo `title` es `NULL`** (feed sin título): `recomputeLastRead` guarda `NULL` ⇒ se mostraría "No data" aunque sí haya items vistos. Aceptable (caso raro; los feeds RSS/IMDB siempre traen título). Si se quiere, fallback a `'(untitled)'` dentro de `recomputeLastRead` para diferenciar "no hay vistos" de "el último no tenía título" — **decisión: dejar NULL**, mantener el contrato simple (`last_read = NULL` ⇔ sin info útil para mostrar).
- **Marcar como visto un item que ya estaba visto:** `markSeen` ya es idempotente (`updated = 0`); `recomputeLastRead` corre igual y deja el mismo valor. Sin side-effects.

---

## Migración de datos

- `ALTER TABLE series ADD COLUMN last_read TEXT` vía `addColumnIfMissing` (idempotente, en el bloque `ready` de `db.mjs`).
- `ALTER TABLE series DROP COLUMN current_chapter` vía `dropColumnIfExists` (idempotente, nuevo helper).
- **Sin backfill.** El entero `current_chapter` no mapea a ningún `title`; toda serie arranca `last_read = NULL`.

---

## Tareas

### Backend
- [x] En `backend/src/models/db.mjs`: nuevo helper `dropColumnIfExists(table, col)` (análogo a `addColumnIfMissing`); llamar `addColumnIfMissing('series', 'last_read', 'TEXT')` y `dropColumnIfExists('series', 'current_chapter')` en el bloque `ready`. En el `CREATE TABLE series` para bases nuevas: incluir `last_read TEXT`, sacar `current_chapter`.
- [x] `backend/src/models/series.mjs`: `ALLOWED_FIELDS` (`-current_chapter`, `+last_read`); `create` recibe `last_read` (default `null`).
- [x] `backend/src/models/series_item.mjs`: agregar `recomputeLastRead(seriesId)` (SELECT `title` ORDER BY … LIMIT 1 + UPDATE `series.last_read`); llamarlo al final de `markSeen`, `markUnseen`, `markSeenUpTo`, `markAllSeen`. `dashboardByUser` no necesita cambios (ya hace `SELECT s.*`).
- [x] `backend/src/index.mjs`: `validateSeries` sin `current_chapter`, con `last_read` (string|null, opcional, ignorar `current_chapter` entrante en PUT); POST/PUT arman `payload`/`fields` con `last_read`; `GET /api/dashboard` mapea `last_read` y deja de mandar `current_chapter`.

### Frontend
- [x] `SeriesForm.vue`: quitar input "Current chapter"; limpiar `form`, `validate`, `submit`, `prefillFromQuery`, `load`.
- [x] `SeriesDetail.vue`: `.last-read Last read: {{ series.last_read || 'No data' }}`; `toggleItem` ahora recarga `series` además del feed (refresh en vivo).
- [x] `DashCard.vue` y `SeriesCard.vue` unificados en un único `SeriesCard.vue` (muestra Latest + Last read; props `showEdit`/`showMarkSeen` controlan acciones). `DashCard.vue` eliminado.
- [x] `Dashboard.vue` y `SeriesList.vue` actualizados para usar el `SeriesCard` unificado.
- [x] `Crunchyroll.vue`: `addToSeries` sin `current_chapter` en el `query`.

### Tests
- [x] `smoke-data-model.mjs` y `smoke-series-crud.mjs`: reemplazar `current_chapter` por `last_read` (donde crean series o validan update); el caso "negativo rechazado" se cambió por "last_read no-string rechazado".
- [x] `smoke-series-detail.mjs`: verificar que tras cada `markSeen`/`markUnseen`/`markAllSeen` el `last_read` (vía `GET /api/series/:id` o dashboard) refleja el `title` correcto del último visto, y vuelve a `null` ("No data") cuando no queda ninguno visto.
- [x] `smoke-dashboard.mjs` y `smoke-rss-engine.mjs`: actualizar fixtures (omitir `current_chapter`, `last_read` null inicial) y verificar `last_read` en el payload del dashboard.
- [x] `smoke-imdb-engine.mjs`: ajustar fixtures de creación de series.

## Verificación

- [x] Serie recién creada ⇒ `last_read = null`, UI muestra **"No data"** en dashboard, lista y detalle.
- [x] Tras `markSeen(item)` ⇒ `last_read = title` de ese item (o del más reciente si la cascada marcó varios); UI lo muestra **en vivo** (sin refresh manual).
- [x] Tras `markUnseen` que deja 0 vistos ⇒ `last_read = null` ⇒ **"No data"**.
- [x] `markAllSeen` ⇒ `last_read` = `title` del último item por orden cronológico (`'Cap 103'` en smoke-dashboard).
- [x] Dashboard y lista de series exponen `last_read` y `last_item_title` (contrato unificado).
- [x] `SeriesCard` único renderiza igual en dashboard y lista; muestra Latest (si pending) + Last read.
- [x] `current_chapter` ya no existe en la tabla `series` (verificado con base existente pre-Épica 10 migrada con `ready`) ni aparece en ningún payload de la API/UI.
- [x] Prefill de Crunchyroll ya no manda `current_chapter` (la serie se crea con `last_read = null`).
- [x] `validateSeries` ignora `current_chapter` en PUT (cliente cacheado no rompe, smoke-series-crud lo cubre) y acepta `last_read` string|null.
- [x] Migración idempotente verificada en segundo boot (helper chequea PRAGMA y noopera).

## Cómo reproducir la verificación

- **Backend (detalle + recálculo):** `cd backend && DB_PATH=./test.sqlite node tests/smoke-series-detail.mjs`.
- **Regresión completa:** `cd backend && for t in smoke-auth smoke-data-model smoke-series-crud smoke-imdb-engine smoke-rss-engine smoke-dashboard smoke-series-detail; do rm -f test.sqlite && DB_PATH=./test.sqlite node tests/$t.mjs; done`.
- **Frontend:** `cd frontend && API=http://localhost:3000 BUILD_OUT_DIR=dist npm run build`.
- **Manual:** levantar dev, crear una serie con feed, disparar refresh, marcar items vistos en el detalle y ver cómo el dashboard/card/detalle actualizan "Last read" en tiempo real.

---

## Alternativas consideradas

- **Derivar el "último leído" por JOIN en cada query, sin columna nueva.** El dashboard ya hace un LEFT JOIN sobre `series_items` para sacar el último item **pendiente**; un JOIN análogo resolvería el último item **visto** sin tocar el schema ni migrar nada, y "No data" caería naturalmente del `LEFT JOIN` sin fila. Es **más simple y no requiere migración**. Se descarta como **primaria** porque: (a) el usuario pidió explícitamente un campo persistente en la serie; (b) un valor almacenado sobrevive al borrado de items (`deleteFuture`, cambio de feed) sin tener que re-calcular en cada lectura; (c) deja la semántica explícita en `series.last_read`. **Si en implementación el costo de migrar/sincronizar resulta alto, esta alternativa es el plan B recomendado** (idéntica UX, cero schema changes — aunque no elimina `current_chapter`, que se sigue queriendo borrar por separado).
- **Guardar el `guid` en vez del `title`.** Más estable ante cambios de título del item entre fetches, pero obliga a un JOIN extra para resolver el `title` a mostrar (más costo en cada lectura del dashboard/detail). El usuario decidió explícitamente que alcanza con el `title` directo; se privilegia la simplicidad de lectura sobre la estabilidad frente a renombres de items (caso raro en la práctica).
- **Renombrar `current_chapter` en vez de drop + add.** Un `ALTER TABLE RENAME COLUMN` cambiaría el nombre pero no el tipo (INTEGER affinity coerce strings a número). Para tener nullable strings de verdad hace falta una columna TEXT nueva, por eso se agrega `last_read` y se **droppea** `current_chapter`.

---

## Archivos a modificar / crear

- `backend/src/models/db.mjs` (nuevo helper `dropColumnIfExists`; `addColumnIfMissing('series', 'last_read', 'TEXT')` + `dropColumnIfExists('series', 'current_chapter')` en `ready`; `CREATE TABLE` con `last_read` y sin `current_chapter`).
- `backend/src/models/series.mjs` (`ALLOWED_FIELDS`, `create`, `listByUser` con JOIN de último pendiente).
- `backend/src/models/series_item.mjs` (`recomputeLastRead` + hook en mutaciones).
- `backend/src/index.mjs` (`validateSeries`, payloads POST/PUT, mapeo de dashboard).
- `backend/tests/smoke-data-model.mjs`, `smoke-series-crud.mjs`, `smoke-series-detail.mjs`, `smoke-dashboard.mjs`, `smoke-rss-engine.mjs`, `smoke-imdb-engine.mjs` (fixtures y asserts).
- `frontend/src/components/SeriesForm.vue` (quitar input `current_chapter`).
- `frontend/src/components/SeriesDetail.vue` (`.last-read` leyendo `series.last_read`; `toggleItem` recarga `series`).
- `frontend/src/components/SeriesCard.vue` (**unificado** con `DashCard`: Latest + Last read; props `showEdit`/`showMarkSeen`).
- `frontend/src/components/Dashboard.vue` y `SeriesList.vue` (usan el `SeriesCard` unificado).
- `frontend/src/components/DashCard.vue` (**eliminado**).
- `frontend/src/components/Crunchyroll.vue` (`addToSeries` sin `current_chapter`).
- `docs/AGENTS.md` y `docs/PROJECT.md` (decisión 9 en la tabla; ya actualizados al crear la épica).
