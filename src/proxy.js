// Doorgeef-proxy tussen browser en Vikunja.
//
// Vrijwel alles gaat ongewijzigd door. Alleen het verzoek "taak aanmaken"
// (PUT /api/v1/projects/{id}/tasks) wordt onderweg aangepast: staat er in de
// titel een Nederlandse datum en is er nog geen deadline, dan zetten we de
// deadline en halen we de datum uit de titel. Vikunja zelf (en de webpagina)
// ziet daardoor meteen het goede resultaat, zonder herladen.
//
// Gaat er iets mis bij het herschrijven, dan wordt het oorspronkelijke verzoek
// ongewijzigd doorgestuurd: de proxy mag een taak nooit laten mislukken.

import http from 'node:http'
import { parseTitle } from './parse.js'

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
])
const MAX_BODY = 5 * 1024 * 1024
const TAAK_AANMAKEN = /^\/api\/v1\/projects\/\d+\/tasks\/?$/
export const HEALTH_PAD = '/__nl-datum/health'

export function isTaakAanmaken(req) {
  if (req.method !== 'PUT') return false
  return TAAK_AANMAKEN.test((req.url ?? '').split('?')[0])
}

/**
 * Past een nieuwe taak (het JSON-object uit het verzoek) aan.
 * @returns {object | null} de aangepaste taak, of null als er niets te doen is
 */
export function herschrijfTaak(taak, { now = new Date(), defaultTime } = {}) {
  if (!taak || typeof taak !== 'object' || typeof taak.title !== 'string') return null

  const r = parseTitle(taak.title, now, { defaultTime })
  if (!r) return null

  const heeftDeadline = typeof taak.due_date === 'string'
    && taak.due_date !== ''
    && !taak.due_date.startsWith('0001-') // Vikunja's "geen datum"
  if (r.due && heeftDeadline) return null // de gebruiker of de frontend koos al een deadline

  const nieuw = { ...taak, title: r.title }
  if (r.due) nieuw.due_date = r.due.toISOString()
  return nieuw
}

async function leesBody(req) {
  const stukken = []
  let grootte = 0
  for await (const stuk of req) {
    grootte += stuk.length
    if (grootte > MAX_BODY) throw Object.assign(new Error('Verzoek te groot'), { status: 413 })
    stukken.push(stuk)
  }
  return Buffer.concat(stukken)
}

function jsonFout(res, status, bericht) {
  if (res.headersSent) return res.destroy()
  const body = JSON.stringify({ code: 0, message: bericht })
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

/**
 * @param {{upstream: string, defaultTime?: string, log?: (msg: string) => void, now?: () => Date}} config
 * @returns {http.Server}
 */
export function createProxy({ upstream, defaultTime = '12:00', log = () => {}, now = () => new Date() }) {
  const doel = new URL(upstream)
  const agent = new http.Agent({ keepAlive: true })

  function stuurDoor(req, res, body) {
    const headers = {}
    for (const [naam, waarde] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(naam) && naam !== 'expect') headers[naam] = waarde
    }
    const ip = req.socket.remoteAddress
    if (ip) headers['x-forwarded-for'] = headers['x-forwarded-for'] ? `${headers['x-forwarded-for']}, ${ip}` : ip
    if (body) headers['content-length'] = String(body.length)

    const omhoog = http.request({
      hostname: doel.hostname,
      port: doel.port || 80,
      method: req.method,
      path: req.url,
      headers,
      agent,
    }, (antwoord) => {
      const uit = {}
      for (const [naam, waarde] of Object.entries(antwoord.headers)) {
        if (!HOP_BY_HOP.has(naam)) uit[naam] = waarde
      }
      res.writeHead(antwoord.statusCode, antwoord.statusMessage, uit)
      antwoord.pipe(res)
    })

    omhoog.on('error', (err) => {
      log(`Vikunja niet bereikbaar op ${upstream}: ${err.message}`)
      jsonFout(res, 502, 'Vikunja is niet bereikbaar (via de Nederlandse datum-proxy).')
    })
    // Browser weggegaan voordat het antwoord klaar was: ook de verbinding naar Vikunja afbreken.
    res.on('close', () => { if (!res.writableFinished) omhoog.destroy() })

    if (body) omhoog.end(body)
    else req.pipe(omhoog)
  }

  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === HEALTH_PAD) {
        const body = JSON.stringify({ status: 'ok', upstream })
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(body)
      }
      if (!isTaakAanmaken(req)) return stuurDoor(req, res)

      const ruw = await leesBody(req)
      let body = ruw
      const type = req.headers['content-type'] ?? ''
      if (!req.headers['content-encoding'] && /json/i.test(type)) {
        try {
          const taak = JSON.parse(ruw.toString('utf8'))
          const nieuw = herschrijfTaak(taak, { now: now(), defaultTime })
          if (nieuw) {
            body = Buffer.from(JSON.stringify(nieuw))
            const deadline = nieuw.due_date && nieuw.due_date !== taak.due_date ? `, deadline ${nieuw.due_date}` : ''
            log(`taak aangepast: ${JSON.stringify(taak.title)} -> ${JSON.stringify(nieuw.title)}${deadline}`)
          }
        } catch (err) {
          log(`taak niet herschreven, ongewijzigd doorgestuurd: ${err.message}`)
          body = ruw
        }
      }
      stuurDoor(req, res, body)
    } catch (err) {
      jsonFout(res, err.status ?? 500, err.status === 413 ? 'Verzoek te groot.' : 'Interne fout in de datum-proxy.')
    }
  })
}
