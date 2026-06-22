# Épica 0 — Limpieza del scaffolding

**Estado:** `[DONE]`
**Objetivo:** Desechar toda la lógica de MangaDex/Telegram conservando únicamente el armazón técnico (Node, Express, SQLite, Vite, Vue, Stylus, Pug, PM2, GitHub Actions).

---

## Alcance

Eliminar:
- `backend/src/bot.mjs`, `search.mjs`, `fetcher.mjs`, `scrapper.mjs`
- `backend/src/models/settings.mjs`
- carpeta `backend/mangas/`
- componentes Vue: `chapter.vue`, `manga.vue`, `search.vue`, `settings.vue`, `hamburger.vue`, `user.vue`, `tooltip.vue`
- lógica `/sync`, `/api/manga/*`, `/api/search`, `/api/random`, `/api/kill`
- variables de env `TELEGRAM_TOKEN`, `TELEGRAM_BOT`, `ORIGIN`
- define `__BOT_NAME__` en Vite

Conservar:
- Express app + CORS + view engine Pug
- Middlewares `verifyToken` / `getUser` (ahora exportados)
- JWT custom (`auth.mjs`)
- `createTable()` helper y conexión SQLite
- Modelo `user` (signup/login)
- Vite config con `dotPathFixPlugin` + `define __API__`
- `dotenv.mjs`, `ecosystem.config.cjs`, `deploy.yml`, `vite.config.js`
- Estilos Stylus y assets públicos

---

## Tareas

- [x] Inspeccionar scaffolding para identificar objetivos de limpieza
- [x] Borrar módulos backend obsoletos (`bot`, `search`, `fetcher`, `scrapper`, `settings`)
- [x] Reducir `backend/src/index.mjs` a Express + auth + middlewares
- [x] Resetear schema en `db.mjs` (quitar `user_data`, dejar `users` mínima)
- [x] Limpiar modelo `user.mjs` (quitar `phone`, `telegram_id`, `changePassword`)
- [x] Borrar componentes y rutas Vue obsoletas; crear `home.vue` placeholder
- [x] Resetear `storage.js` y `main.js`
- [x] Limpiar `index.html` (quitar `<hamburger>` y `<settings>`)
- [x] Quitar `node-telegram-bot-api` de deps; renombrar package a `mangacafe-bk`; agregar `npm start`
- [x] Limpiar `env_example` y quitar `__BOT_NAME__` de `vite.config.js`

## Verificación

- [x] `npm install` en backend y frontend sin errores
- [x] Backend arranca en `PORT` del `.env`
- [x] `GET /api/` → `{"message":"Manga Café API"}`
- [x] `POST /api/signup` crea usuario y rechaza duplicados
- [x] `POST /api/login` devuelve JWT válido; credenciales malas → 401
- [x] `vite build` compila (31 módulos, ~470ms)

## Archivos modificados / creados

- `backend/src/index.mjs` (rewritten)
- `backend/src/models/db.mjs` (rewritten)
- `backend/src/models/user.mjs` (rewritten)
- `backend/package.json` (deps + scripts)
- `frontend/src/main.js` (rewritten)
- `frontend/src/storage.js` (rewritten)
- `frontend/src/components/home.vue` (nuevo placeholder)
- `frontend/index.html` (editado)
- `frontend/vite.config.js` (editado)
- `env_example` (limpiado)

## Notas

- El password sigue con `md5` hasta la Épica 2 (decisión del usuario: migrar a bcrypt).
- Se dejó un `.env` temporal en el root (gitignored) para dev local con `PORT/DB_PATH/API/SECRET`.
- El cron de PM2 sigue diario (`0 0 * * *`); se ajusta en la Épica 8.
