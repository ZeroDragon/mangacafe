// Smoke test para Épica 2: autenticación (bcrypt + tokens).
// Correr desde backend/: node tests/smoke-auth.mjs
import '../../dotenv.mjs'
import db, { ready } from '../src/models/db.mjs'
import user from '../src/models/user.mjs'
import Auth from '../src/auth.mjs'
import bcrypt from 'bcrypt'
import mcaptcha from '../src/mcaptcha.mjs'

await ready // garantiza que el schema está creado antes de queryar

// Épica 15: /api/signup ahora exige mcaptcha_token. Este smoke opera a nivel
// de modelo (user.signup directo), pero importar index.mjs como side-effect
// registraría el handler. Bypasamos el captcha por si se invoca vía HTTP.
mcaptcha.verifyToken = async () => true

const log = (...a) => console.log('•', ...a)
const fail = (...a) => { console.error('✗', ...a); process.exitCode = 1 }

const auth = new Auth({ secret: process.env.SECRET })

const username = `auth_${Date.now()}`
const password = 'hunter2'

log(`Signup de ${username}`)
const signupRes = await user.signup(username, password)
if (signupRes.error) fail('signup:', signupRes.error)

log('Verificando que el hash en BD es bcrypt ($2b$...) y NO md5')
const { data: u } = await user.getBy('username', username)
if (!u) fail('usuario no encontrado tras signup')
const isBcrypt = typeof u.password === 'string' && /^\$2[abxy]\$\d{2}\$/.test(u.password)
const isMd5 = /^[a-f0-9]{32}$/.test(u.password || '')
log(`hash: ${u.password}`)
if (!isBcrypt) fail('el hash NO es bcrypt')
if (isMd5) fail('el hash parece md5 (debería ser bcrypt)')
log('Hash bcrypt OK')

log('bcrypt.compare contra el password correcto')
if (!(await bcrypt.compare(password, u.password))) fail('compare falló con password correcto')
log('bcrypt.compare OK')

log('Login con password correcto')
const loginOk = await user.login(username, password)
if (loginOk.error || !loginOk.success) fail('login correcto falló:', loginOk.error)
log('Login correcto OK')

log('Login con password incorrecto')
const loginBad = await user.login(username, 'WRONG')
if (!loginBad.error) fail('login con mal password debería dar error')
log('Login incorrecto rechazado OK')

log('Login de usuario inexistente')
const loginNone = await user.login(`nope_${Date.now()}`, 'x')
if (!loginNone.error) fail('login inexistente debería dar error')
log('Login inexistente rechazado OK')

log('Signup duplicado')
const dup = await user.signup(username, password)
if (!dup.error) fail('signup duplicado debería dar error')
log('Signup duplicado rechazado OK')

log('Tokens: generateToken / verifyToken / refreshToken')
const token = auth.generateToken({ username })
if (!auth.verifyToken(token)) fail('verifyToken válido devolvió false')
log(`token generado y verificado: ${token.slice(0, 24)}...`)
// pequeño delay para que el timestamp interno cambie (ms de resolución)
await new Promise(r => setTimeout(r, 5))
const refreshed = auth.refreshToken(token)
if (!refreshed) fail('refreshToken devolvió valor falso')
if (refreshed === token) fail('refreshToken debe devolver un token nuevo (timestamp distinto)')
log('refreshToken devuelve token nuevo OK')
if (!auth.verifyToken(refreshed)) fail('token rotado inválido')
log('Token rotado verifica OK')

log('verifyToken con token manipulado -> false')
const [, sign] = token.split('.')
const tampered = `${token.split('.')[0]}.${sign.slice(0, -2)}XX`
if (auth.verifyToken(tampered)) fail('token manipulado pasó verificación')
log('Token manipulado rechazado OK')

log('parseToken extrae el username')
const parsed = auth.parseToken(refreshed)
if (parsed.meta.username !== username) fail('parseToken no extrajo username')
log(`parseToken OK: meta.username=${parsed.meta.username}`)

log('=== Smoke test Épica 2 OK ===')
db.close()
