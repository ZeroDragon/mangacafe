# Épica 15 — Protección de signup con mCaptcha (proof-of-work)

**Estado:** `[PENDING]`
**Objetivo:** Bloquear la creación masiva de cuentas falsas en `POST /api/signup` sin degradar la UX ni trackear usuarios. Se integra **mCaptcha** (CAPTCHA basado en proof-of-work de SHA-256): el navegador del usuario computa un hash hasta cumplir una dificultad, recibe un token de un solo uso del server de mCaptcha, y el backend de Manga Café valida ese token antes de aceptar el alta. Sin cookies, sin fingerprinting, sin enviar data a terceros como Google. El **login** (`/api/login`) **no se protege** — sólo el signup (es la puerta de entrada para bots que quieran crear cuentas).

**Depende de:** Épica 2 (auth + `POST /api/signup` + `Login.vue`).
**Habilita:** signup público sin miedo a spam/abuso, manteniendo privacidad (cero tracking).

---

## Contexto / motivación

`POST /api/signup` hoy es totalmente abierto: cualquier request con `{ username, password }` crea una cuenta. No hay rate-limit ni verificación. Un bot puede crear miles de cuentas en segundos (la DB de `users` crece, se ensucia, y si el sitio se vuelve público el problema escala).

Las opciones consideradas (ver *Alternativas*) se descartan por fricción (reCAPTCHA envía data a Google, hCaptcha no es tan conocido) o por requerir infraextra (email verification necesita SMTP provider). **mCaptcha** es el balance óptimo para Manga Café:

- **Sin tracking**: el proof-of-work mismo es el filtro. No hay cookies, no hay IP tracking, no hay perfilado.
- **UX invisible**: el usuario ve un widget pequeño que se resuelve solo en 1-2s. No hay que clickear semáforos ni bicicletas.
- **Costo asimétrico**: un humano paga ~1s de CPU por cuenta. Un bot que quiere crear 10,000 cuentas paga 10,000× ese costo → económicamente inviable.
- **Sin dependencias backend pesadas**: una llamada HTTP a `demo.mcaptcha.org` para validar el token. Cero paquetes npm nuevos en el backend (sólo `axios`, ya instalado).
- **Instancia ya configurada**: el usuario ya tiene cuenta en `demo.mcaptcha.org` con su `MCAPTCHA_SITE_KEY`.

### Decisiones de producto (nuevas — agregar a `AGENTS.md` y `PROJECT.md`)

| # | Decisión | Valor |
|---|----------|-------|
| 14 | Anti-bot en signup vía mCaptcha | `POST /api/signup` requiere un `mcaptcha_token` válido emitido por `demo.mcaptcha.org`. El backend valida el token contra `/api/v1/pow/siteverify` antes de crear la cuenta. Login **no** se protege. Env vars: `MCAPTCHA_SITE_KEY` (ya existe), `MCAPTCHA_SECRET_KEY` (nueva — ver *Tareas*), `MCAPTCHA_VERIFY_URL` (default `https://demo.mcaptcha.org/api/v1/pow/siteverify`). Si `MCAPTCHA_SECRET_KEY` falta → el signup queda **deshabilitado** (devuelve 503) para no abrir un hueco de seguridad por misconfiguration (Épica 15). |

---

## Alcance

### 1. Env vars — `env_example` + `.env`

El usuario ya agregó `MCAPTCHA_SITE_KEY`. Faltan dos:

```
MCAPTCHA_SITE_KEY "..."           # público, va al frontend (ya existe)
MCAPTCHA_SECRET_KEY "..."             # SECRETO server-side para validar tokens (NUEVO — obtenerlo del panel de mCaptcha)
MCAPTCHA_VERIFY_URL "https://demo.mcaptcha.org/api/v1/pow/siteverify"   # override por si se self-hostea mCaptcha
```

**`MCAPTCHA_SECRET_KEY` se obtiene del panel de mCaptcha** (no del `.env`): login en `demo.mcaptcha.org` → Settings → copiar "Secret". Es distinto del site key (el site key es público; el secret **sólo** vive en el backend y nunca se envía al browser).

**Fail-closed**: si `process.env.MCAPTCHA_SECRET_KEY` es falsy al boot, el backend loguea un error y los requests a `/api/signup` devuelven `503 { error: "Signup disabled (captcha not configured)" }`. Esto evita que un deploy sin secret deje el signup abierto.

### 2. Backend — validador mCaptcha — nuevo — `backend/src/mcaptcha.mjs`

Módulo delgado que valida un token contra el server de mCaptcha. Un solo export:

```js
import axios from 'axios'

const VERIFY_URL = process.env.MCAPTCHA_VERIFY_URL || 'https://demo.mcaptcha.org/api/v1/pow/siteverify'
const SECRET = process.env.MCAPTCHA_SECRET_KEY
const SITEKEY = process.env.MCAPTCHA_SITE_KEY
const TIMEOUT = Number(process.env.MCAPTCHA_TIMEOUT) || 8000

export const isMcaptchaConfigured = () => !!(SECRET && SITEKEY)

// Valida un token de mCaptcha. Devuelve true si es válido, false en caso contrario
// (incluyendo timeout / error de red: fail-closed, no fail-open).
export const verifyToken = async (token) => {
  if (!isMcaptchaConfigured()) return false
  if (typeof token !== 'string' || !token.trim()) return false
  try {
    const { data } = await axios.post(VERIFY_URL, {
      token,
      secret: SECRET,
      sitekey: SITEKEY
    }, { timeout: TIMEOUT })
    return !!(data && data.valid)
  } catch (err) {
    console.error('[mcaptcha] verify failed:', err?.message || err)
    return false
  }
}

export default { verifyToken, isMcaptchaConfigured }
```

**Contract del server de mCaptcha** (`POST /api/v1/pow/siteverify`):
- Body: `{ token: string, secret: string, sitekey: string }`.
- Response 200: `{ valid: boolean }`.
- Tokens son **de un solo uso** y expiran en ~30s → no se puede reusar ni precomputar.

**Fail-closed**: cualquier error (red caída, mCaptcha offline, timeout) devuelve `false`. Es preferible bloquear un signup legítimo durante un outage de mCaptcha que abrir el signup a bots.

### 3. Backend — handler de signup — `backend/src/index.mjs`

```js
// ANTES:
app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body
  res.json(await user.signup(username, password))
})

// DESPUÉS:
import mcaptcha from './mcaptcha.mjs'

app.post('/api/signup', async (req, res) => {
  // Fail-closed: si mCaptcha no está configurado, no abrimos el signup.
  if (!mcaptcha.isMcaptchaConfigured()) {
    return res.status(503).json({ error: 'Signup disabled (captcha not configured)' })
  }
  const { username, password, mcaptcha_token } = req.body
  const ok = await mcaptcha.verifyToken(mcaptcha_token)
  if (!ok) return res.status(400).json({ error: 'Captcha verification failed' })
  const result = await user.signup(username, password)
  if (result.error) return res.status(400).json({ error: result.error })
  res.json(result)
})
```

- **Status codes:** 503 si mCaptcha no está configurado, 400 si el captcha falla o si `user.signup` rechaza (usuario duplicado, password débil — el handler actual ya propagaba eso, ahora también).
- **`/api/login` no se toca**: la protección es sólo para crear cuentas, no para entrar a las existentes (los bots primero necesitan crear la cuenta; si no pueden, no llegan al login).
- **Rate-limit fuera de alcance** de esta épica (ver *Alternativas*). El proof-of-work de mCaptcha ya impone un costo computacional por intento.

### 4. Frontend — widget en `Login.vue`

#### 4a. Dependencia: `@mcaptcha/vanilla-glue`

Paquete oficial que renderiza el widget (un `<iframe>` pequeño que computa el PoW y emite el token via `postMessage`). Se agrega a `frontend/package.json`.

```js
import { getSession } from '@mcaptcha/vanilla-glue'
```

#### 4b. Template — widget sólo en modo "signup"

El widget se renderiza **sólo cuando `mode === 'signup'`**. En login no aparece (no hay nada que verificar).

```pug
form(@submit.prevent="submit")
  label
    span Username
    input(v-model="username" type="text" autocomplete="username" required)
  label
    span Password
    input(... required)
  .mcaptcha-widget(
    v-if="mode === 'signup'"
    ref="mcaptchaWidget")
  button(type="submit" :disabled="loading || (mode === 'signup' && !mcaptchaToken)")
    | {{ mode === 'login' ? 'Sign in' : 'Sign up' }}
  p.error(v-if="error") {{ error }}
```

#### 4c. Script — integración con vanilla-glue

`@mcaptcha/vanilla-glue` expone `getSession` que escucha `postMessage` del iframe y llama un callback cuando el PoW está listo. El callback recibe el token y lo guardamos en `data()`:

```js
import api from '../api.js'
import { getSession } from '@mcaptcha/vanilla-glue'

const MCAPTCHA_SITE_KEY = __MCAPTCHA_SITE_KEY__   // inyectado por Vite (ver 4d)
const MCAPTCHA_INSTANCE = __MCAPTCHA_INSTANCE__   // 'https://demo.mcaptcha.org'

export default {
  name: 'Login',
  data () {
    return {
      mode: 'login',
      username: '',
      password: '',
      loading: false,
      error: '',
      mcaptchaToken: ''     // se setea cuando el widget termina el PoW
    }
  },
  watch: {
    mode (next) {
      // Al cambiar a signup, (re)inicializamos el widget. Al volver a login, limpiamos.
      this.mcaptchaToken = ''
      this.error = ''
      if (next === 'signup') this.$nextTick(() => this.mountMcaptcha())
    }
  },
  methods: {
    setMode (mode) { this.mode = mode },
    mountMcaptcha () {
      const el = this.$refs.mcaptchaWidget
      if (!el || !MCAPTCHA_SITE_KEY) return
      // Vanilla-glue inyecta el <iframe> en el contenedor y escucha el postMessage.
      getSession(MCAPTCHA_INSTANCE, MCAPTCHA_SITE_KEY, el, (token) => {
        this.mcaptchaToken = token
      })
    },
    async submit () {
      this.loading = true
      this.error = ''
      try {
        if (this.mode === 'signup') {
          const res = await api.post('/api/signup', {
            username: this.username,
            password: this.password,
            mcaptcha_token: this.mcaptchaToken
          })
          if (res.data.error) {
            this.error = res.data.error
            // Si el captcha falló, el token ya se consumió → hay que resolver otro.
            this.mcaptchaToken = ''
            this.$nextTick(() => this.mountMcaptcha())
            return
          }
        }
        await api.post('/api/login', { username: this.username, password: this.password })
        this.$router.push('/dashboard')
      } catch (e) {
        this.error = (e.response && e.response.data && e.response.data.error) || 'Unexpected error'
        // En cualquier fallo de signup, reseteamos el captcha (token stale).
        if (this.mode === 'signup') {
          this.mcaptchaToken = ''
          this.$nextTick(() => this.mountMcaptcha())
        }
      } finally {
        this.loading = false
      }
    }
  }
}
```

Detalles:
- El botón de submit queda **deshabilitado** mientras `mcaptchaToken` esté vacío en modo signup — evita submits sin PoW.
- Si el backend rechaza (captcha inválido, usuario duplicado, etc.), se resetea el token y se re-monta el widget para forzar un nuevo PoW (los tokens son de un solo uso).
- `getSession` es idempotente si el iframe ya existe; igualmente lo llamamos en `$nextTick` para asegurar que el `ref` esté disponible.

#### 4d. Vite — inyección de site key + instancia

El `site key` es público (va al browser), así que se inyecta vía `define` en `vite.config.js` (igual que `__API__`):

```js
// vite.config.js
import dotenv from './dotenv.mjs'   // o como ya lo lean
const env = dotenv()                 // o el helper existente

export default defineConfig({
  define: {
    __API__: JSON.stringify(env.API),
    __MCAPTCHA_SITE_KEY__: JSON.stringify(env.MCAPTCHA_SITE_KEY || ''),
    __MCAPTCHA_INSTANCE__: JSON.stringify(env.MCAPTCHA_INSTANCE || 'https://demo.mcaptcha.org')
  }
})
```

`MCAPTCHA_INSTANCE` es nuevo pero opcional: default `https://demo.mcaptcha.org`. Sirve por si el usuario self-hostea mCaptcha en el futuro.

#### 4e. Estilos

El widget es un `<iframe>` de mCaptcha que se acomoda solo (no necesita estilos custom más allá del contenedor):

```stylus
.mcaptcha-widget
  min-height 64px         // reserva espacio para que no salte el layout
  display flex
  justify-content center
  margin -2px 0
```

El `min-height` evita layout shift mientras carga el iframe.

### 5. Smoke test — nuevo — `backend/tests/smoke-captcha.mjs`

Cubre el handler con mCaptcha mockeado (sin red):

```js
import '../../dotenv.mjs'
import http from 'http'
import axios from 'axios'
import db, { ready } from '../src/models/db.mjs'
import { app } from '../src/index.mjs'
import mcaptcha from '../src/mcaptcha.mjs'

await ready

// Mock temporal: verifyToken devuelve lo que digamos.
const realVerify = mcaptcha.verifyToken
let mockResult = true
mcaptcha.verifyToken = async () => mockResult

const server = http.createServer(app)
await new Promise(r => server.listen(0, r))
const baseURL = `http://localhost:${server.address().port}`
const request = (path, body) => axios.post(baseURL + path, body, { validateStatus: () => true })

// 1. Con mock true + token → signup OK.
mockResult = true
const ok = await request('/api/signup', {
  username: 'user_ok_' + Date.now(),
  password: 'pass',
  mcaptcha_token: 'fake-valid'
})
assert(ok.status === 200, `esperaba 200 con captcha válido, vino ${ok.status}`)

// 2. Con mock false → 400.
mockResult = false
const bad = await request('/api/signup', {
  username: 'user_bad_' + Date.now(),
  password: 'pass',
  mcaptcha_token: 'fake-invalid'
})
assert(bad.status === 400, `esperaba 400 con captcha inválido, vino ${bad.status}`)
assert(/captcha/i.test(bad.data.error), `mensaje inesperado: ${bad.data.error}`)

// 3. Sin token en body → 400.
mockResult = true
const noTok = await request('/api/signup', {
  username: 'user_notok_' + Date.now(),
  password: 'pass'
})
assert(noTok.status === 400, `esperaba 400 sin token, vino ${noTok.status}`)

// 4. Login no requiere captcha (regresión).
const loginRes = await request('/api/login', { username: 'user_ok_' + Date.now(), password: 'pass' })
// (no comparamos status 200 porque cleanup de DB — el punto es que NO pide captcha)

// 5. Fail-closed: si desconfiguramos el secret, signup devuelve 503.
const realIsConfigured = mcaptcha.isMcaptchaConfigured
mcaptcha.isMcaptchaConfigured = () => false
const disabled = await request('/api/signup', { username: 'x', password: 'x', mcaptcha_token: 't' })
assert(disabled.status === 503, `esperaba 503 fail-closed, vino ${disabled.status}`)
mcaptcha.isMcaptchaConfigured = realIsConfigured

// Cleanup
mcaptcha.verifyToken = realVerify
await new Promise(r => server.close(r))
db.close()
```

### 6. Tests existentes — regresión

`smoke-auth.mjs` (Épica 2) crea usuarios vía `/api/signup` sin mandar `mcaptcha_token`. Va a romper porque ahora el captcha es obligatorio. **Fix:** mockear `mcaptcha.verifyToken = async () => true` al inicio del smoke-auth (igual que hace el nuevo smoke-captcha). Es el patrón estándar: los tests no dependen de la red ni de mCaptcha real.

```js
// backend/tests/smoke-auth.mjs — agregar al inicio:
import mcaptcha from '../src/mcaptcha.mjs'
mcaptcha.verifyToken = async () => true   // bypass en tests
```

---

## Migración de datos

Ninguna. No se toca la DB ni las columnas existentes. mCaptcha es stateless del lado de Manga Café (el token se valida contra `demo.mcaptcha.org` y se descarta).

---

## Tareas

### Setup (manual — usuario)
- [ ] Obtener `MCAPTCHA_SECRET_KEY` del panel de `demo.mcaptcha.org` (Settings → Secret) y agregarlo a `.env` y `env_example`. **Es distinto del site key.**

### Backend
- [ ] `backend/src/mcaptcha.mjs` (**nuevo**): `verifyToken(token)` + `isMcaptchaConfigured()`. Usa `axios` (ya instalado). Fail-closed en errores.
- [ ] `backend/src/index.mjs`: handler de `/api/signup` valida `mcaptcha_token` antes de `user.signup`. Fail-closed con 503 si no está configurado.
- [ ] `backend/tests/smoke-captcha.mjs` (**nuevo**): cubre captcha válido/inválido/ausente, fail-closed, login sin captcha.
- [ ] `backend/tests/smoke-auth.mjs`: mockear `verifyToken = async () => true` para no romper.

### Frontend
- [ ] `frontend/package.json`: agregar `@mcaptcha/vanilla-glue`.
- [ ] `frontend/vite.config.js`: `define __MCAPTCHA_SITE_KEY__` y `__MCAPTCHA_INSTANCE__` desde env.
- [ ] `frontend/src/components/Login.vue`: widget en modo signup, `getSession` para capturar token, botón deshabilitado sin token, reset del token en fallo.
- [ ] Estilos del contenedor `.mcaptcha-widget` (`min-height` para evitar layout shift).

### Doc
- [ ] `env_example`: `MCAPTCHA_SECRET_KEY`, `MCAPTCHA_VERIFY_URL`, `MCAPTCHA_INSTANCE`, `MCAPTCHA_TIMEOUT`.
- [ ] `docs/AGENTS.md` y `docs/PROJECT.md`: decisión 14 + fila en la tabla de épicas.
- [ ] `docs/ARCHITECTURE.md`: nuevo endpoint behavior, nuevo módulo `mcaptcha.mjs`, env vars.

## Verificación

- [ ] Signup con `mcaptcha_token` válido (widget resuelto) → cuenta creada, 200.
- [ ] Signup con token inválido/falso → 400 `"Captcha verification failed"`.
- [ ] Signup sin `mcaptcha_token` en body → 400.
- [ ] Login existente **sin** captcha → 200 (regresión).
- [ ] Si `MCAPTCHA_SECRET_KEY` falta del `.env` → `/api/signup` devuelve 503 (fail-closed).
- [ ] Si `demo.mcaptcha.org` está caído (timeout/desconexión) → `/api/signup` devuelve 400 (fail-closed, no abre el signup).
- [ ] En el browser: el widget aparece sólo en modo "Create account", resuelve el PoW en 1-2s, habilita el botón, y el signup pasa.
- [ ] En mobile: el widget se ve bien (responsive, no rompe el layout del form).
- [ ] `smoke-auth.mjs` sigue en verde (con el mock).
- [ ] Regresión completa: todos los smoke tests en verde.

## Cómo reproducir la verificación

- **Smoke captcha:** `cd backend && DB_PATH=./test.sqlite SECRET=test node tests/smoke-captcha.mjs`.
- **Regresión completa:** `cd backend && for t in smoke-auth smoke-data-model smoke-series-crud smoke-imdb-engine smoke-rss-engine smoke-sources smoke-dashboard smoke-series-detail smoke-reels smoke-captcha; do rm -f test.sqlite && DB_PATH=./test.sqlite SECRET=test node tests/$t.mjs; done`.
- **Frontend build:** `cd frontend && API=http://localhost:3000 BUILD_OUT_DIR=dist npm run build`.
- **Manual (E2E):**
  1. Levantar dev con `MCAPTCHA_SITE_KEY` y `MCAPTCHA_SECRET_KEY` en `.env`.
  2. Ir a `/login`, cambiar a "Create account".
  3. Ver el widget de mCaptcha aparecer y resolver el PoW (1-2s).
  4. Botón "Sign up" se habilita.
  5. Llenar username + password, submit → cuenta creada, redirect a `/dashboard`.
  6. Verificar que con DevTools → Network el POST `/api/signup` manda `mcaptcha_token` en el body.

---

## Alternativas consideradas

- **Email verification** (link al inbox para activar la cuenta). **Descartado por ahora:** requiere un SMTP provider (Resend/SendGrid), una columna `users.email` + `users.verified_at`, un flujo de "click en el link", y manejo de expiración de tokens. Es lo más fuerte anti-spam pero multiplica la complejidad. mCaptcha es más liviano y suficiente para el threat model actual. Se deja como opción futura si el spam escala.
- **Google reCAPTCHA v3** (score invisible). **Descartado:** envía datos de comportamiento del usuario a Google (mouse, teclado, browsing), que contradice el espíritu privacy-first del proyecto. mCaptcha no trackea nada.
- **Cloudflare Turnstile** (widget invisible validado por CF). **Descartado:** depende del ecosistema Cloudflare y requiere que el dominio esté detrás de CF. mCaptcha funciona en cualquier deployment. (Si la app se mueve 100% a CF, Turnstile es una alternativa razonable.)
- **hCaptcha.** **Descartado:** sigue pidiendo interacción (click en imágenes) en su tier free, y su API es similar a reCAPTCHA (más compleja que mCaptcha).
- **Rate-limit por IP** (`express-rate-limit`). **Descartado como capa única:** frena olas pero no bots distribuidos (un atacante con IP rotation lo bypassa trivialmente). **Útil como capa adicional** sobre mCaptcha (un humano + PoW por IP cada X minutos), pero fuera de alcance de esta épica para mantenerla enfocada. Se puede sumar después.
- **Honeypot** (campo oculto que los bots rellenan). **Descartado como capa única:** trivial de bypass una vez que el atacante inspecciona el HTML. Útil combinado con mCaptcha, pero no por sí solo.
- **Invite-only / codes** (el owner reparte códigos para registrarse). **Descartado:** cambia el modelo de producto (de registro público a cerrado). Si el usuario decide cerrar el signup, esto es la solución total — pero mientras haya signup público, mCaptcha es lo que se necesita.
- **TOTP / 2FA en signup.** **Descartado por semántica:** TOTP protege el *login* de cuentas ya existentes (enlazás un app Authenticator al crear la cuenta y luego pedís el código al entrar). No puede gatear el *registro* —el bot todavía no tiene cuenta cuando intenta crearla, así que no hay secret TOTP que verificar. Es un feature útil para el login, pero no resuelve el problema de cuentas falsas.

---

## Notas

### Fail-closed vs fail-open

El design choice clave: si mCaptcha falla (timeout, caída, misconfiguration), el backend **no abre el signup**. Es preferible bloquear un humano legítimo durante un outage que dejar entrar bots. Las dos protecciones fail-closed:

1. `MCAPTCHA_SECRET_KEY` faltante → 503 al boot del handler.
2. `verifyToken` lanza / timeout → `false` → 400 al cliente.

Si mCaptcha tuviera un outage prolongado, el mitigante es que mCaptcha rara vez se cae (es stateless y el demo es estable); y si pasa, el usuario (admin) puede temporalmente mover el handler a "aceptar todo" como hotfix — pero **ese no es el default**.

### Costo para el usuario final

- **Desktop moderno:** ~1-2s de cómputo invisible. El usuario ve el widget cargarse, resolver, y el botón habilitarse. No hay fricción perceptible.
- **Mobile viejo:** ~2-4s. Puede notarse. Es el trade-off del proof-of-work vs CAPTcha tradicional (donde el costo es cognitivo, no computacional).
- **El PoW es por signup, no por login:** los usuarios existentes no pagan nada. Sólo al crear cuenta.

### Por qué mCaptcha no degrada el SEO ni la accesibilidad

- **SEO:** el widget de mCaptcha no es parte del contenido indexable; además `/login` no es una página que necesite SEO.
- **Accesibilidad:** a diferencia de reCAPTCHA (que excluye usuarios con discapacidad visual por sus retos de imágenes), mCaptcha es invisible y no requiere interacción. El único caso de exclusión es dispositivos muy viejos donde el PoW toma muchos segundos.

### Instancia: demo.mcaptcha.org vs self-hosted

`demo.mcaptcha.org` es la instancia managed oficial. Suficiente para Manga Café (no necesita HA ni escala). Si en el futuro se quiere control total (sin depender de un tercero), mCaptcha es AGPL y se puede self-hostear con Docker + Postgres. La env var `MCAPTCHA_VERIFY_URL` ya soporta ese cambio sin tocar código.

### Privacidad del token

El `mcaptcha_token` se manda del browser al backend de Manga Café, y del backend al server de mCaptcha (junto con el secret y sitekey). mCaptcha **no** recibe ni el username ni el password — sólo el token que él mismo emitió. El flujo es:

```
browser ─(token en body del signup)→ backend Manga Café ─(token + secret + sitekey)→ mCaptcha
```

mCaptcha responde `{ valid: boolean }` y no guarda relación con la cuenta que se está creando.

---

## Archivos a modificar / crear

- `backend/src/mcaptcha.mjs` (**nuevo**, validador: `verifyToken`, `isMcaptchaConfigured`).
- `backend/src/index.mjs` (handler de `/api/signup` valida token + fail-closed).
- `backend/tests/smoke-captcha.mjs` (**nuevo**).
- `backend/tests/smoke-auth.mjs` (mock `verifyToken` para bypass en tests).
- `frontend/package.json` (agregar `@mcaptcha/vanilla-glue`).
- `frontend/vite.config.js` (`define __MCAPTCHA_SITE_KEY__`, `__MCAPTCHA_INSTANCE__`).
- `frontend/src/components/Login.vue` (widget en signup + `getSession` + reset en fallo).
- `env_example` (`MCAPTCHA_SECRET_KEY`, `MCAPTCHA_VERIFY_URL`, `MCAPTCHA_INSTANCE`, `MCAPTCHA_TIMEOUT`).
- `docs/AGENTS.md` y `docs/PROJECT.md` (decisión 14 + fila en la tabla de épicas).
- `docs/ARCHITECTURE.md` (nuevo endpoint behavior, nuevo módulo `mcaptcha.mjs`, env vars).
