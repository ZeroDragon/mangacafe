import axios from 'axios'

// Detección best-effort del título de un reel de Facebook (Épica 11).
//
// Facebook NO expone el título de forma confiable vía scraping:
//  - Muchas páginas públicas renderizan <meta property="og:title">, pero…
//  - …los reels de perfiles, privados o bajo challenge anti-bot devuelven un
//    login wall o un HTML de `mbasic` que NO contiene el título real.
//  - Bloquea User-Agents obvios de bots; hay que mandar uno de navegador real.
//
// Por eso el title NUNCA bloquea el alta: si el fetch falla o no encuentra
// nada, se devuelve null y la UI muestra la URL recortada como fallback.

const DEFAULT_UA = process.env.REEL_USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const DEFAULT_TIMEOUT = Number(process.env.REEL_TIMEOUT) || 8000

// Strings triviales que devuelve FB cuando no hay título real (login wall, etc.).
const TRIVIAL = new Set([
  'facebook', 'log in to facebook', 'log in', 'facebook log in',
  'log in · facebook', 'log into facebook'
])

// Extrae el título de un HTML de Facebook buscando og:title primero (más
// confiable que <title>, que suele ser "Log in to Facebook | Facebook").
const extractFromHtml = (html) => {
  if (!html || typeof html !== 'string') return null
  // og:title aparece como <meta property="og:title" content="...">
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
  const candidate = og ? og[1] : null
  if (!candidate) return null
  const trimmed = candidate.trim()
  if (!trimmed) return null
  if (TRIVIAL.has(trimmed.toLowerCase())) return null
  return trimmed
}

// Detecta el título best-effort. Devuelve string no vacío o null.
// Opciones (todas opcionales, con defaults de env): userAgent, timeout, fetcher.
// `fetcher` permite inyectar una función get(url, opts) para tests sin red.
const detectTitle = async (url, opts = {}) => {
  const userAgent = opts.userAgent || DEFAULT_UA
  const timeout = opts.timeout || DEFAULT_TIMEOUT
  const fetcher = opts.fetcher || ((u, o) => axios.get(u, o))
  try {
    const res = await fetcher(url, {
      headers: { 'User-Agent': userAgent },
      responseType: 'text',
      timeout,
      validateStatus: () => true
    })
    if (res.status < 200 || res.status >= 300) return null
    return extractFromHtml(res.data)
  } catch (e) {
    return null
  }
}

export default detectTitle
export { extractFromHtml }
