// Adapter RSS: wrapper delgado sobre parseFeed (que sigue en src/rss.mjs).
// Recibe el body ya fetcheado y devuelve { items } en el formato estándar.
import parseFeed from '../rss.mjs'

export const RSS_ADAPTER = {
  name: 'rss',
  // No tiene hosts registrados: se llega vía sniff del body en el orquestador.
  hosts: [],
  parse (body) {
    // parseFeed es async (xml2js); lo preservamos para no romper la firma.
    return parseFeed(body).then(items => ({ items }))
  }
}

export default RSS_ADAPTER
