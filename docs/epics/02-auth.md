# Épica 2 — Autenticación

**Estado:** `[DONE]`
**Objetivo:** Migrar el hashing de passwords a `bcrypt`, exponer el usuario actual, y construir el flujo de login/signup en el frontend con protección de rutas.

**Depende de:** ninguna (puede ir en paralelo con Épica 1).
**Habilita:** todas las épicas que requieran sesión (3, 4, 5, 6).

---

## Alcance

### Backend
- Reemplazar `md5` por `bcrypt` en `backend/src/models/user.mjs`.
- Endpoint `GET /api/me` (protegido) → devuelve `{ username }` y token rotado.
- Migración de hashes existentes (si los hay) — opcional, ver notas.

### Frontend
- Componentes `Login.vue` y `Signup.vue` (o uno combinado con toggle).
- Guard de navegación global: si no hay `localStorage.token`, redirige a `/login`.
- Layout mínimo (header con logout) para las pantallas autenticadas.
- Helper HTTP que adjunte `Authorization: Bearer <token>` y maneje 401 (limpiar token y redirigir).

---

## Tareas

- [x] Instalar `bcrypt` en `backend/`.
- [x] Reescribir `signup` en `user.mjs`: `bcrypt.hash(password, 10)` en vez de `md5`.
- [x] Reescribir `login`: traer el row por username y validar con `bcrypt.compare`.
- [x] Agregar `GET /api/me` con `[verifyToken, getUser]` → `{ username, token: res.newToken }`.
- [x] Crear `frontend/src/api.js` (helper axios con `__API__`, interceptor de `Authorization` y handler de 401).
- [x] Crear `frontend/src/components/Login.vue` (form con toggle login/signup, llama `/api/login` o `/api/signup`).
- [x] Agregar rutas `/login` (pública) y `/dashboard` (protegida, placeholder por ahora).
- [x] Agregar guard global en el router: `if (!localStorage.token && to.path !== '/login') redirect('/login')`.
- [x] Layout: componente `AppHeader.vue` con username + botón logout.
- [x] Token rotation: guardar `res.newToken` en `localStorage.token` tras cada llamada autenticada exitosa.

## Verificación

- [x] Crear usuario nuevo → en la BD el password está hasheado con bcrypt (`$2b$...`), no md5.
- [x] Login correcto devuelve token; login incorrecto → 401.
- [x] `GET /api/me` con token válido → 200 `{ username }`; sin token → 401; token inválido → 403.
- [x] En el frontend, entrar a `/dashboard` sin token redirige a `/login`.
- [x] Logout limpia `localStorage.token` y redirige a `/login`.

## Cómo reproducir la verificación

- **Backend (modelo + tokens):** `cd backend && node tests/smoke-auth.mjs` (verifica bcrypt en BD, login, dedupe, rotación y firma de tokens).
- **Backend (HTTP):** levantar `npm start` y ejercitar `/api/signup`, `/api/login` y `/api/me` (casos 200/401/403).
- **Frontend:** `cd frontend && API=http://localhost:3000 BUILD_OUT_DIR=dist npm run build` compila sin errores. El guard del router redirige a `/login` si no hay `localStorage.token`; `AppHeader` valida el token vía `/api/me` al montarse y ofrece logout.

## Notas de implementación

- `md5` se eliminó de `backend/package.json`; el único algoritmo de password ahora es `bcrypt` (cost factor 10).
- `api.js` registra un handler `onUnauthorized` (seteado desde `main.js`) para redirigir a `/login` en 401, evitando import circular con el router.
- Rotación de token: el interceptor de respuesta guarda `response.data.token` en `localStorage` (lo emiten `/api/login` y `/api/me`, y futuros endpoints protegidos que incluyan `token`).
- `AppHeader` hace logout también ante un fallo de `/api/me` (cubriendo tokens invalidados → 403).

## Notas / decisiones

- **Fuerza de bcrypt:** cost factor 10 (default razonable; ajustar si hay lentitud).
- **Migración de hashes md5 preexistentes:** como la Épica 0 reseteó el schema y es proyecto personal, se puede pedir al usuario recrear su cuenta. Si se quiere conservar, añadir lógica "si el hash no empieza con `$2`, rehashear tras login exitoso". Recomendado: **resetear** (no hay usuarios reales todavía).
- **Expiración del token:** sigue en 1 año (`auth.mjs`). Revisar si se quiere acortar y añadir refresh token real más adelante.
- **Sin reset por Telegram:** ese flujo se eliminó en la Épica 0. Si se necesita recuperación de password, evaluar en otra épica (no está en scope).
