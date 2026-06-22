# Épica 8 — Deploy e infra

**Estado:** `[IN PROGRESS]`
**Objetivo:** Ajustar env, scheduler de RSS, y pipeline de deploy para el nuevo flujo.

**Depende de:** Épicas 1–4 mínimamente (para que haya algo que deployar).
**Habilita:** producción real.

---

## Alcance

### Env
- `env_example` final (sin `TELEGRAM_*` ni `ORIGIN`):
  ```
  PORT <api port>
  DB_PATH <location of your database>
  API <url to this api>
  SECRET <to sign the jwt>
  IMDB_USER_AGENT <realistic UA for IMDB GraphQL>
  IMDB_TIMEOUT <ms, e.g. 15000>
  IMDB_GRAPHQL_ENDPOINT <default https://api.graphql.imdb.com/>
  IMDB_TZ <timezone para decidir si un episodio ya emitió>
  RSS_USER_AGENT <UA for feed fetches>
  RSS_TIMEOUT <ms, e.g. 15000>
  BUILD_OUT_DIR <donde vite escribe el build (dist para dev, /srv/www/... para prod con nginx)>
  ```
- Documentar en `ARCHITECTURE.md` las nuevas vars.

### Scheduler en producción
- Implementado como scheduler interno con `setInterval(6h)` arrancando al boot (`refresher.startScheduler({ runImmediately: true })`), más refresh inicial. Post-Épica 9 hace dispatch por tipo (IMDB o RSS).
- `ecosystem.config.cjs` (renombrado a `.cjs` porque `package.json` es `"type": "module"`) en `exec_mode: 'fork'`. El `cron_restart: '0 0 * * *'` queda como saneamiento de memoria.

### Pipeline (`.github/workflows/deploy.yml`)
- Hace scp + ssh + `npm i` + `vite build` + `pm2 delete` + `pm2 start ecosystem.config.cjs` + `pm2 save`. El `delete`+`start` es necesario porque `pm2 restart` no recarga código nuevo ni el ecosystem.
- `BUILD_OUT_DIR` se lee del `.env` (cargado por `dotenv.mjs` desde `vite.config.js`).
- Migración de BD: las migraciones (`renameColumnIfMissing`, `addColumnIfMissing`, `createTable`) corren automáticamente al boot y son idempotentes. Para el primer deploy del nuevo flujo se optó por borrar la DB vieja (decisión del usuario).

---

## Tareas

- [x] Confirmar variables finales en `env_example` y `ARCHITECTURE.md`.
- [x] Decidir scheduler: scheduler interno con `setInterval` (post-Épica 9, dispatch por tipo). `ecosystem.config.cjs` en `exec_mode: 'fork'` + `cron_restart` diario como saneamiento.
- [x] Documentar `RSS_USER_AGENT`, `RSS_TIMEOUT`, `IMDB_*` y `BUILD_OUT_DIR` en `env_example`.
- [x] DB de producción reseteada (decisión del usuario; las migraciones igual son idempotentes).
- [x] Fix `deploy.yml`: `pm2 restart` → `pm2 delete` + `pm2 start ecosystem.config.cjs` + `pm2 save` (para que cargue código nuevo y el ecosystem correcto).
- [ ] Probar `deploy.yml` manual (`workflow_dispatch`) con `secrets.ENVFILE` actualizado con las vars nuevas (incluido `BUILD_OUT_DIR`).
- [ ] Verificar que el frontend build output es servido correctamente por nginx (rutas SPA, assets).
- [ ] Smoke test post-deploy: crear usuario, serie (manga con RSS, anime con IMDB), refrescar feed, ver dashboard.

## Verificación

- [x] Deploy manual ejecuta end-to-end sin errores.
- [x] Backend en producción crea las tablas nuevas al bootear (visto en logs: "Creating table 'users' / 'series' / 'series_items'").
- [x] El scheduler corre al boot (visto en logs: `[feeds] refreshAll: refreshed=0 failed=0 total=0` — sin series todavía).
- [x] App responde vía nginx (`curl https://api.mangacafe.vip/api/` → `{"message":"Manga Café API"}`).
- [ ] Dashboard carga datos reales tras crear series y disparar refresh.

## Notas

- Si la BD SQLite vive en el server y hay concurrencia, habilitar `WAL` (`PRAGMA journal_mode=WAL`) para evitar locks.
- Considerar backup automático de la BD en el cron (p.ej. `.backup` de sqlite3 antes del restart).
- Revisar `max_memory_restart` de PM2 (100M) si el scheduler RSS consume más.
- **Post-mortem deploy 1:** PM2 cargaba en cluster mode por default y rompía el check `isMain`. Fixes: `exec_mode: 'fork'` explícito en ecosystem + reemplazo del check `process.argv[1] === import.meta.url` (frágil bajo PM2) por `!process.argv[1].includes('tests/')`.
