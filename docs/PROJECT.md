# Manga Café — Visión y decisiones

Tracker de lectura de mangas y episodios de anime. Permite saber, al abrir la app, qué series tienen novedades y cuántos capítulos/episodios faltan por ver.

---

## Objetivo de producto

Mantener un registro personal de series (manga o anime) que el usuario está siguiendo, con su URL, portada, capítulo actual y —opcionalmente— un feed RSS para detectar actualizaciones automáticamente.

El dashboard debe responder en cada refresco: **"tenés N capítulos pendientes en X series"**.

## Flujo principal

1. Login (multiusuario).
2. Alta/edición de series (tipo, nombre, URL, portada, capítulo actual, RSS opcional).
3. Dashboard con refresco automático de RSS y conteo de pendientes.
4. Detalle de serie para ver feed y marcar como visto.

---

## Decisiones de producto (inmutables salvo consulta)

1. **Password:** migrar `md5` → `bcrypt` (Épica 2).
2. **Multiusuario** real: aislamiento estricto por `user_id`.
3. **Portada:** URL externa únicamente. Nada de subidas.
4. **Conteo de pendientes:** items RSS nuevos no vistos. Iterar si no alcanza.
5. **Refresco RSS:** cada 6h en prod; on-demand en dev.
6. **Series independientes:** manga y anime son entries distintos con `type`.
7. **Errores de RSS:** visibles en el dashboard.

## Stack conservado

Node + Express + SQLite + Vite + Vue 3 + Vue Router + Stylus + Pug + PM2 + GitHub Actions. Ver `ARCHITECTURE.md` para el detalle.

---

## Épicas

| # | Épica | Estado | Archivo |
|---|-------|--------|---------|
| 0 | Limpieza del scaffolding | `[DONE]` | [epics/00-cleanup.md](epics/00-cleanup.md) |
| 1 | Modelo de datos (`series`, `series_items`) | `[DONE]` | [epics/01-data-model.md](epics/01-data-model.md) |
| 2 | Autenticación (bcrypt + guard + vistas) | `[DONE]` | [epics/02-auth.md](epics/02-auth.md) |
| 3 | CRUD de series | `[PENDING]` | [epics/03-series-crud.md](epics/03-series-crud.md) |
| 4 | Motor RSS | `[PENDING]` | [epics/04-rss-engine.md](epics/04-rss-engine.md) |
| 5 | Dashboard de actualizaciones | `[PENDING]` | [epics/05-dashboard.md](epics/05-dashboard.md) |
| 6 | Detalle de serie | `[PENDING]` | [epics/06-series-detail.md](epics/06-series-detail.md) |
| 7 | Pulido y UX | `[PENDING]` | [epics/07-polish.md](epics/07-polish.md) |
| 8 | Deploy e infra | `[PENDING]` | [epics/08-deploy.md](epics/08-deploy.md) |

Estado de marcas: `[DONE]` completada · `[IN PROGRESS]` en curso · `[BLOCKED]` bloqueada · `[PENDING]` pendiente.

Al terminar una épica, actualizar su archivo (secciones *Tareas* con checklist y *Verificación*) y la marca en esta tabla.

---

## Cómo retomar el trabajo

1. Leé `docs/AGENTS.md` (reglas y convenciones).
2. Leé `docs/ARCHITECTURE.md` (cómo está cableado el scaffolding).
3. Mirá la tabla de épicas de arriba y abrí el archivo de la próxima `[PENDING]`.
4. Respetá las decisiones de producto; si una tarea las contradice, pará y consultá.
