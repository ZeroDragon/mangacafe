# Épica 1 — Modelo de datos

**Estado:** `[DONE]`
**Objetivo:** Definir y crear el schema SQLite para series y su historial de items RSS, sobre el que se apoyan todas las épicas siguientes.

**Depende de:** ninguna (fundación).
**Habilita:** Épicas 3, 4, 5, 6.

---

## Alcance

- Extender `backend/src/models/db.mjs` con dos tablas nuevas.
- Crear modelo `backend/src/models/series.mjs` con CRUD básico (la lógica de endpoints va en la Épica 3).
- Crear modelo `backend/src/models/series_item.mjs` para el histórico de items RSS.
- Índices para queries frecuentes (dashboard, dedupe, refresco).

---

## Schema objetivo

```sql
CREATE TABLE series (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('manga', 'anime')),
  name TEXT NOT NULL,
  url TEXT,
  cover_url TEXT,
  current_chapter INTEGER NOT NULL DEFAULT 0,
  rss_url TEXT,
  last_known_total INTEGER,
  last_checked_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  CONSTRAINT series_users_FK FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_series_user ON series(user_id);
CREATE INDEX idx_series_user_type ON series(user_id, type);
CREATE INDEX idx_series_last_checked ON series(last_checked_at);

CREATE TABLE series_items (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL,
  guid TEXT NOT NULL,
  title TEXT,
  link TEXT,
  pub_date INTEGER,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  CONSTRAINT series_items_series_FK FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
  CONSTRAINT series_items_uniq UNIQUE (series_id, guid)
);

CREATE INDEX idx_items_series ON series_items(series_id);
CREATE INDEX idx_items_series_unseen ON series_items(series_id, seen);
```

### Justificación de campos

- `type`: `manga` | `anime` (decisión 6: entries independientes).
- `current_chapter`: nº manual que lleva el usuario (avanza al marcar visto).
- `rss_url`: NULL si la serie no tiene feed (decisión: RSS opcional).
- `last_known_total`: total de items vistos en el último refresco (para detectar delta).
- `last_checked_at`: timestamp del último fetch RSS (para el cron de 6h).
- `last_error`: mensaje de error del feed (decisión 7: visible en dashboard); NULL si ok.
- `series_items.guid`: identificador único del item RSS para dedup; UNIQUE por serie.
- `series_items.seen`: 0 = pendiente, 1 = visto/marcado.

### Conteo de pendientes (decisión 4)

```sql
SELECT COUNT(*) FROM series_items WHERE series_id = ? AND seen = 0
```

---

## Tareas

- [x] Agregar tabla `series` a `createTable(...)` en `db.mjs`
- [x] Agregar tabla `series_items` a `createTable(...)` en `db.mjs`
- [x] Agregar los índices (van como `CREATE INDEX` separados tras verificar que la tabla existe; creación encadenada para evitar race con las tablas)
- [x] Crear `backend/src/models/series.mjs` con:
  - `create(userId, { type, name, url, cover_url, current_chapter, rss_url })`
  - `listByUser(userId)` — todas las series del usuario
  - `getById(id, userId?)` — con validación de ownership (`user_id`) opcional
  - `update(id, userId, fields)` — actualizar campos permitidos (whitelist `ALLOWED_FIELDS`, actualiza `updated_at`)
  - `remove(id, userId)` — borrar (CASCADE borra items gracias a `PRAGMA foreign_keys = ON`)
- [x] Crear `backend/src/models/series_item.mjs` con:
  - `insertMany(seriesId, items)` — upsert con `INSERT OR IGNORE` sobre `(series_id, guid)`; devuelve cuántos insertó
  - `pendingCount(seriesId)` — `COUNT(*) WHERE seen = 0`
  - `pendingByUser(userId)` — agregación por serie (LEFT JOIN, para el dashboard)
  - `markSeen(itemId)` / `markSeenUpTo(seriesId, itemId)` (por `(created_at, id)`)
  - `listBySeries(seriesId, { onlyPending })`
- [x] Verificar que al bootear el backend se crean las tablas sin error

Extras:
- [x] Exportar `ready` (promise) desde `db.mjs` para que tests/scripts esperen el schema
- [x] Habilitar `PRAGMA foreign_keys = ON` por conexión para que `ON DELETE CASCADE` funcione
- [x] Smoke test `backend/tests/smoke-data-model.mjs`

## Verificación

- [x] Borrar la BD dev y reiniciar el backend: las 3 tablas (`users`, `series`, `series_items`) y los 5 índices existen.
- [x] Script de smoke test (`backend/tests/smoke-data-model.mjs`) que: crea usuario → inserta serie → inserta 3 items (uno repetido en la 2da tanda) → cuenta pendientes → marca visto → vuelve a contar. Verifica además ownership, update, remove con CASCADE.

```bash
cd backend && rm -f test.sqlite && node tests/smoke-data-model.mjs
# => === Smoke test OK ===
```

Endpoints existentes siguen verdes: `GET /api/`, `POST /api/signup`, `POST /api/login`. `vite build` OK (31 módulos).

## Notas / decisiones pendientes

- **No crear endpoints HTTP todavía** — eso es Épica 3. Aquí solo modelos.
- Considerar si `markSeen` debe además incrementar `current_chapter` automáticamente o si el usuario lo setea a mano. Propuesta: al marcar el item más reciente como visto, setear `current_chapter = MAX(items visto)`, pero dejar override manual. → Se deja para la Épica 6 (detalle de serie) cuando se defina la UX exacta.
- Evaluar migración a un wrapper de promesas para `sqlite3` (p.ej. `sqlite` o manual `util.promisify`) si el callback hell crece. → Se mantiene el patrón `new Promise` por ahora; `series_item.insertMany` usa `db.serialize` + `prepared statement` que es razonable.

## Archivos modificados / creados

- `backend/src/models/db.mjs` (2 tablas nuevas + 5 índices + `ready` export + PRAGMA FKs)
- `backend/src/models/series.mjs` (nuevo)
- `backend/src/models/series_item.mjs` (nuevo)
- `backend/tests/smoke-data-model.mjs` (nuevo)
