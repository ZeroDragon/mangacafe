# Manga Café — Contexto para agentes IA

> **Leé este archivo primero.** Es el punto de entrada para retomar el desarrollo en cualquier sesión. Después continuá con `PROJECT.md`, `ARCHITECTURE.md` y el estado de las épicas en `epics/`.

---

## Qué es el proyecto

Tracker personal de lectura de mangas y episodios de anime vistos. Reemplazo completo del proyecto anterior (que era un cliente de MangaDex con bot de Telegram). **Solo se conserva el scaffolding técnico.**

### Flujo de usuario objetivo

1. El usuario hace login.
2. Da de alta una serie: nombre, URL donde la lee/ve, portada (URL externa), capítulo actual, y opcionalmente un feed RSS.
3. Cada vez que entra al dashboard, el sistema refresca los feeds RSS y le muestra:
   - Qué series tienen actualizaciones.
   - Cuántos episodios/capítulos le faltan por ver (conteo de items nuevos no vistos).
   - Errores de feeds visibles para que pueda corregirlos.

---

## Decisiones de producto (del usuario — NO cambiar sin consultar)

| # | Decisión | Valor |
|---|----------|-------|
| 1 | Hashing de password | **Migrar a `bcrypt`** (actualmente `md5`, se cambia en Épica 2) |
| 2 | Usuarios | **Multiusuario real** (filtrar siempre por `user_id`, índices estrictos) |
| 3 | Portada | **Solo URL externa** (no subir archivos, no usar `multer`, no carpeta de imágenes) |
| 4 | Detección de nº de capítulo | **Conteo de items RSS nuevos desde el último visto**. Si no funciona, se itera |
| 5 | Cron de refresco RSS | **Cada 6h en producción** + **trigger on-demand para desarrollo** |
| 6 | Manga vs anime | **Entries independientes** con campo `type` (una serie no agrupa ambos) |
| 7 | Fallos de RSS | **Error visible** en el dashboard para que el usuario lo corrija |

---

## Stack conservado (no reemplazar)

- **Backend:** Node.js (ESM, `.mjs`) + Express 4 + SQLite3 (driver `sqlite3` con callbacks) + Pug (registrado como view engine) + JWT custom (`backend/src/auth.mjs`).
- **Frontend:** Vue 3 (build runtime+compiler) + Vue Router 4 + Vite 5 + Stylus + Pug (en `<template lang="pug">` de los SFCs). Sin Vuex/Pinia.
- **Infra:** PM2 (`backend/ecosystem.config.js`) + GitHub Actions (`.github/workflows/deploy.yml`, manual `workflow_dispatch`).
- **Env:** loader custom en `dotenv.mjs` (formato `KEY value` con **un solo espacio** como separador).

### Qué se eliminó en la Épica 0
`bot.mjs`, `search.mjs`, `fetcher.mjs`, `scrapper.mjs`, `models/settings.mjs`, carpeta `mangas/`, y los componentes Vue `chapter`, `manga`, `search`, `settings`, `hamburger`, `user`, `tooltip`.

---

## Reglas de trabajo para agentes

1. **Leer antes de editar.** Usar `view` en cualquier archivo antes de modificarlo; respetar indentación exacta (Stylus es sensible al sangrado).
2. **ESM obligatorio** en backend: extensión `.mjs`, imports con rutas relativas con extensión incluida.
3. **Rutas del backend:** todas bajo prefijo `/api/`. Las protegidas usan el middleware `[verifyToken, getUser]` exportado desde `backend/src/index.mjs`.
4. **Frontend → backend:** la URL base se inyecta con `define` de Vite como `__API__` (ver `frontend/vite.config.js`). Usar `${__API__}/...`. Token JWT va en `localStorage.token` y header `Authorization: Bearer <token>`.
5. **DB:** driver `sqlite3` con callbacks envueltas en `Promise`. Las tablas se crean con `createTable()` de `backend/src/models/db.mjs` al importar el módulo.
6. **Estilos:** Stylus con variables CSS definidas en `frontend/src/styles.styl` (`--background`, `--foreground`, `--primary`, `--danger`). Iconos Material Symbols ya cargados en `index.html`.
7. **Multiusuario:** toda query a `series`/`series_items` DEBE filtrar por `user_id` (vía JOIN con `series` o validando ownership). No exponer nunca datos de otro usuario.
8. **No reintroducir:** Telegram, MangaDex, subida de archivos, `multer`, `__BOT_NAME__`, ni la tabla `user_data`.
9. **Testear después de cada cambio:** backend `npm start` desde `backend/`; frontend `npm run build` o `npm run dev` desde `frontend/`. Hay un `.env` temporal en el root (gitignored) para dev local.
10. **Commits:** solo cuando el usuario lo pida explícitamente.

---

## Cómo correr el proyecto (dev)

```bash
# 1. .env en el root (formato KEY value separado por UN espacio)
#    PORT 3000
#    DB_PATH ./dev.sqlite
#    API http://localhost:3000
#    SECRET <cualquier-string>

# 2. Backend
cd backend && npm install && npm start

# 3. Frontend (otra terminal)
cd frontend && npm install && API=http://localhost:3000 npm run dev
```

> El `.env` del root **no se commitea** (`.gitignore` tiene `*.env`). Para el build de producción, `vite.config.js` lee `env.API` y `env.BUILD_OUT_DIR`.

---

## Mapa rápido de archivos

```
backend/
  ecosystem.config.js          # PM2: app "mangacafe", cron_restart diario (ajustar a 6h en Épica 8)
  package.json                 # deps: express, sqlite3, pug, md5 (→bcrypt E2), xml2js, axios
  src/
    index.mjs                  # Express app + rutas + middlewares verifyToken/getUser (exportados)
    auth.mjs                   # JWT custom (HMAC-SHA256, expira 1 año)
    models/
      db.mjs                   # conexión SQLite + createTable() + schema de users
      user.mjs                 # signup/login/getBy/update (md5 hoy, bcrypt mañana)
frontend/
  index.html                   # entry HTML, carga styles.styl + fonts, monta #app
  vite.config.js               # plugin vue + dotPathFixPlugin + define __API__
  src/
    main.js                    # createApp + router (ruta "/" → home.vue) + plugin storage
    storage.js                 # plugin $storage (reactive store simple, sin lógica de MangaDex)
    styles.styl                # variables CSS globales
    components/
      home.vue                 # placeholder (reemplazar en Épica 5)
docs/
  AGENTS.md                    # ESTE ARCHIVO
  PROJECT.md                   # visión, decisiones, épicas (índice)
  ARCHITECTURE.md              # detalle técnico del scaffolding conservado
  epics/
    00-cleanup.md ... 08-deploy.md
```

---

## Estado actual y próximos pasos

- **Completada:** Épica 0 (limpieza del scaffolding). Backend arranca, `signup`/`login` funcionan, `vite build` compila.
- **Próxima sugerida:** Épica 1 (modelo de datos: tablas `series` y `series_items`) o Épica 2 (auth con bcrypt). Recomendado hacer **Épica 1 primero** porque fija el contrato de datos.

Leé `PROJECT.md` para el índice de épicas y `epics/NN-*.md` para el detalle de cada una.
