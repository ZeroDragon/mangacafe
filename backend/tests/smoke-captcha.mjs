// Smoke test para Épica 15: protección de signup con mCaptcha (proof-of-work).
// Correr desde backend/: DB_PATH=./test.sqlite SECRET=test node tests/smoke-captcha.mjs
import '../../dotenv.mjs'
import http from 'http'
import axios from 'axios'
import db, { ready } from '../src/models/db.mjs'
import { app } from '../src/index.mjs'
import mcaptcha from '../src/mcaptcha.mjs'

await ready

const log = (...a) => console.log('•', ...a)
const fail = (...a) => { console.error('✗', ...a); process.exitCode = 1 }
const assert = (cond, msg) => cond ? log(msg) : fail(msg)

// --- Contrato del validador (unit, sin red) ---
// El guard de empty/non-string token NO toca la red: es la rama corta que
// protege al handler de requests sin token.
assert(await mcaptcha.verifyToken(undefined) === false, '0a. verifyToken(undefined) → false (sin red)')
assert(await mcaptcha.verifyToken('') === false, '0b. verifyToken("") → false (sin red)')
assert(await mcaptcha.verifyToken(null) === false, '0c. verifyToken(null) → false (sin red)')
assert(typeof mcaptcha.isMcaptchaConfigured() === 'boolean', '0d. isMcaptchaConfigured() devuelve boolean')

// --- Handler (HTTP) con verifyToken mockeado ---
// Mock temporal: devuelve lo que diga `mockResult`. isMcaptchaConfigured se
// reasigna para el caso fail-closed.
const realVerify = mcaptcha.verifyToken
const realIsConfigured = mcaptcha.isMcaptchaConfigured
let mockResult = true
mcaptcha.verifyToken = async () => mockResult

const server = http.createServer(app)
await new Promise(r => server.listen(0, r))
const baseURL = `http://localhost:${server.address().port}`
const request = (path, body) => axios.post(baseURL + path, body, { validateStatus: () => true })

// 1. Con mock true + token → signup OK (200).
mockResult = true
const ok = await request('/api/signup', {
  username: 'user_ok_' + Date.now(),
  password: 'pass',
  mcaptcha_token: 'fake-valid'
})
assert(ok.status === 200, `1. signup con captcha válido → 200 (vino ${ok.status})`)

// 2. Con mock false → 400 con mensaje de captcha.
mockResult = false
const bad = await request('/api/signup', {
  username: 'user_bad_' + Date.now(),
  password: 'pass',
  mcaptcha_token: 'fake-invalid'
})
assert(bad.status === 400, `2. signup con captcha inválido → 400 (vino ${bad.status})`)
assert(/captcha/i.test(bad.data.error), `2b. mensaje menciona captcha (vino: ${bad.data.error})`)

// 3. Sin token en body → 400. Restauramos verifyToken real: su guard de
//    empty token (network-safe) rechaza el request antes de tocar mCaptcha.
mcaptcha.verifyToken = realVerify
const noTok = await request('/api/signup', {
  username: 'user_notok_' + Date.now(),
  password: 'pass'
})
assert(noTok.status === 400, `3. signup sin token → 400 (vino ${noTok.status})`)
assert(/captcha/i.test(noTok.data.error), `3b. mensaje menciona captcha (vino: ${noTok.data.error})`)

// 4. Login NO requiere captcha (regresión): no importa el estado del mock,
//    /api/login no toca mcaptcha. Sólo verificamos que el error no sea de captcha.
const loginRes = await request('/api/login', { username: 'user_no_existe_' + Date.now(), password: 'pass' })
assert(!/captcha/i.test(loginRes.data?.error || ''), `4. login no pide captcha (status ${loginRes.status})`)

// 5. Fail-closed: si desconfiguramos el secret, signup devuelve 503 sin importar el token.
mcaptcha.verifyToken = async () => true // aún con un verify "exitoso"
mcaptcha.isMcaptchaConfigured = () => false
const disabled = await request('/api/signup', {
  username: 'user_disabled_' + Date.now(),
  password: 'pass',
  mcaptcha_token: 't'
})
assert(disabled.status === 503, `5. fail-closed desconfigurado → 503 (vino ${disabled.status})`)
assert(/disabled|configured/i.test(disabled.data.error), `5b. mensaje fail-closed (vino: ${disabled.data.error})`)
mcaptcha.isMcaptchaConfigured = realIsConfigured

// Cleanup
mcaptcha.verifyToken = realVerify
await new Promise(r => server.close(r))
db.close()

if (!process.exitCode) console.log('=== Smoke test Épica 15 OK ===')
