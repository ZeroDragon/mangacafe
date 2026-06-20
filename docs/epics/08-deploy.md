# Épica 8 — Deploy e infra

**Estado:** `[PENDING]`
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
  RSS_USER_AGENT <realistic UA for feed fetches>
  RSS_TIMEOUT <ms, e.g. 15000>
  ```
- Documentar en `ARCHITECTURE.md` las nuevas vars.

### Scheduler RSS en producción
- Implementar el refresco cada 6h (decisión 5):
  - **Opción preferida:** scheduler interno con `setInterval(6h)` o `node-cron` arrancando al boot, más un refresh inicial.
  - Ajustar `ecosystem.config.js`: si se confía en `cron_restart`, cambiar a `'0 */6 * * *'`; si hay scheduler interno, dejar el restart diario solo como saneamiento de memoria.

### Pipeline (`.github/workflows/deploy.yml`)
- Ya hace scp + ssh + `npm i` + `vite build` + `pm2 restart`.
- Verificar que `BUILD_OUT_DIR` apunta donde el backend sirve estáticos (si los sirve) o al path del servidor web.
- Migración de BD: antes del primer deploy, **backup** de la BD anterior y cleanup de tablas obsoletas (`user_data`). Como la Épica 0 reseteó el schema, basta con borrar el `.sqlite` viejo en el server.

---

## Tareas

- [ ] Confirmar variables finales en `env_example` y `ARCHITECTURE.md`.
- [ ] Decidir scheduler: implementar `node-cron` interno (preferido) o ajustar PM2.
- [ ] Documentar `RSS_USER_AGENT` y `RSS_TIMEOUT` en `env_example`.
- [ ] Backup de la BD de producción antes del primer deploy del nuevo flujo.
- [ ] Probar `deploy.yml` manual (`workflow_dispatch`) con `secrets.ENVFILE` actualizado.
- [ ] Verificar que el frontend build output es servido correctamente (CORS, rutas SPA).
- [ ] Smoke test post-deploy: crear usuario, serie, refrescar RSS, ver dashboard.

## Verificación

- [ ] Deploy manual ejecuta end-to-end sin errores.
- [ ] Backend en producción crea las tablas nuevas al bootear.
- [ ] El scheduler de RSS corre cada 6h (ver logs).
- [ ] Dashboard cargue datos reales tras deploy.

## Notas

- Si la BD SQLite vive en el server y hay concurrencia, habilitar `WAL` (`PRAGMA journal_mode=WAL`) para evitar locks.
- Considerar backup automático de la BD en el cron (p.ej. `.backup` de sqlite3 antes del restart).
- Revisar `max_memory_restart` de PM2 (100M) si el scheduler RSS consume más.
