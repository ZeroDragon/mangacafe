import cripto from 'crypto'

class Auth {
  constructor (meta) {
    if (!meta?.secret) throw new Error('secret is required')
    this.meta = meta
  }

  _signature (string) {
    return cripto
      .createHmac('sha256', this.meta.secret)
      .update(string)
      .digest('hex')
      .toUpperCase()
  }

  _data2string (data, timestamp = new Date().getTime(), expiration = 1000 * 60 * 60 * 24 * 365) {
    const payload = {
      timestamp: parseInt(this.meta.timestamp, 10) || timestamp,
      expiration: parseInt(this.meta.expiration, 10) || expiration,
      meta: data
    }
    const string = JSON.stringify(payload)
    const base64 = Buffer.from(string).toString('base64')
    return base64
      .replace(/\//g, '_')
      .replace(/\+/g, '-')
  }

  parseToken (token) {
    const [data] = token.split('.')
    const cleaned = data.replace(/_/g, '/').replace(/-/g, '+')
    const string = Buffer.from(cleaned, 'base64').toString('binary')
    const encoded = [...string]
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
    const decoded = decodeURIComponent(encoded)
    return JSON.parse(decoded)
  }

  verifyToken (token) {
    const [, sign] = token.split('.')
    let dataParsed
    try {
      dataParsed = this.parseToken(token)
    } catch (error) {
      return false
    }
    const { meta, timestamp, expiration } = dataParsed
    const string = this._data2string(meta, timestamp, expiration)
    const signature = this._signature(string)
    if (sign !== signature) return false
    return expiration + timestamp > new Date().getTime()
  }

  generateToken (data) {
    const string = this._data2string(data)
    const signature = this._signature(string)
    return `${string}.${signature}`
  }

  refreshToken(token) {
    if (!this.verifyToken(token)) return false
    const data = this.parseToken(token)
    return this.generateToken(data.meta)
  }
}

export default Auth
