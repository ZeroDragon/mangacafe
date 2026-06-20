# Épica 2 — Autenticación

**Estado:** `[PENDING]`
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

- [ ] Instalar `bcrypt` en `backend/`.
- [ ] Reescribir `signup` en `user.mjs`: `bcrypt.hash(password, 10)` en vez de `md5`.
- [ ] Reescribir `login`: traer el row por username y validar con `bcrypt.compare`.
- [ ] Agregar `GET /api/me` con `[verifyToken, getUser]` → `{ username, token: res.newToken }`.
- [ ] Crear `frontend/src/api.js` (helper axios con `__API__`, interceptor de `Authorization` y handler de 401).
- [ ] Crear `frontend/src/components/Login.vue` (form con toggle login/signup, llama `/api/login` o `/api/signup`).
- [ ] Agregar rutas `/login` (pública) y `/dashboard` (protegida, placeholder por ahora).
- [ ] Agregar guard global en el router: `if (!localStorage.token && to.path !== '/login') redirect('/login')`.
- [ ] Layout: componente `AppHeader.vue` con username + botón logout.
- [ ] Token rotation: guardar `res.newToken` en `localStorage.token` tras cada llamada autenticada exitosa.

## Verificación

- [ ] Crear usuario nuevo → en la BD el password está hasheado con bcrypt (`$2b$...`), no md5.
- [ ] Login correcto devuelve token; login incorrecto → 401.
- [ ] `GET /api/me` con token válido → 200 `{ username }`; sin token → 401; token inválido → 403.
- [ ] En el frontend, entrar a `/dashboard` sin token redirige a `/login`.
- [ ] Logout limpia `localStorage.token` y redirige a `/login`.

## Notas / decisiones

- **Fuerza de bcrypt:** cost factor 10 (default razonable; ajustar si hay lentitud).
- **Migración de hashes md5 preexistentes:** como la Épica 0 reseteó el schema y es proyecto personal, se puede pedir al usuario recrear su cuenta. Si se quiere conservar, añadir lógica "si el hash no empieza con `$2`, rehashear tras login exitoso". Recomendado: **resetear** (no hay usuarios reales todavía).
- **Expiración del token:** sigue en 1 año (`auth.mjs`). Revisar si se quiere acortar y añadir refresh token real más adelante.
- **Sin reset por Telegram:** ese flujo se eliminó en la Épica 0. Si se necesita recuperación de password, evaluar en otra épica (no está en scope).
