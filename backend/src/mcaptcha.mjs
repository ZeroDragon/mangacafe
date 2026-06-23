import axios from 'axios'

const VERIFY_URL = process.env.MCAPTCHA_VERIFY_URL || 'https://demo.mcaptcha.org/api/v1/pow/siteverify'
const SECRET = process.env.MCAPTCHA_SECRET_KEY
const SITEKEY = process.env.MCAPTCHA_SITE_KEY
const TIMEOUT = Number(process.env.MCAPTCHA_TIMEOUT) || 8000

export const isMcaptchaConfigured = () => !!(SECRET && SITEKEY)

// Valida un token de mCaptcha contra el server de proof-of-work.
// Devuelve true sólo si mCaptcha confirma el token; false en cualquier
// otro caso (no configurado, token vacío, red caída, timeout).
// Fail-closed: nunca abre el signup ante un error.
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
