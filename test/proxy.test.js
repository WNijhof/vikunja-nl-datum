import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { createProxy } from '../src/proxy.js'

process.env.TZ = 'Europe/Amsterdam'

// Woensdag 11 november 2026, 09:00
const NU = new Date(2026, 10, 11, 9, 0, 0)

let ontvangen // verzoeken die bij de nagebootste Vikunja aankomen
let vikunja
let proxy
let proxyPoort
let vikunjaPoort

function luister(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

before(async () => {
  vikunja = http.createServer(async (req, res) => {
    const stukken = []
    for await (const s of req) stukken.push(s)
    const body = Buffer.concat(stukken)
    ontvangen.push({ method: req.method, url: req.url, headers: req.headers, body })

    if (req.url === '/api/v1/niet-gevonden') {
      res.writeHead(404, { 'content-type': 'application/json' })
      return res.end('{"message":"nee"}')
    }
    // Echo: wat Vikunja ontvangt, krijgt de browser terug, plus twee cookies en een eigen header.
    res.writeHead(200, {
      'content-type': req.headers['content-type'] ?? 'application/octet-stream',
      'set-cookie': ['a=1; Path=/', 'b=2; Path=/'],
      'x-eigen': 'ja',
    })
    res.end(body)
  })
  vikunjaPoort = await luister(vikunja)
  proxy = createProxy({ upstream: `http://127.0.0.1:${vikunjaPoort}`, now: () => NU })
  proxyPoort = await luister(proxy)
})

after(() => {
  proxy.closeAllConnections()
  vikunja.closeAllConnections()
  proxy.close()
  vikunja.close()
})

beforeEach(() => { ontvangen = [] })

const url = (pad) => `http://127.0.0.1:${proxyPoort}${pad}`
const json = (obj) => JSON.stringify(obj)
const JSON_HEADERS = { 'content-type': 'application/json', authorization: 'Bearer voorbeeld-token' }

function aangekomen() {
  assert.equal(ontvangen.length, 1, 'precies één verzoek bij Vikunja verwacht')
  return ontvangen[0]
}

test('taak aanmaken: titel wordt schoongemaakt en deadline gezet, de browser krijgt het resultaat terug', async () => {
  const res = await fetch(url('/api/v1/projects/3/tasks'), {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: json({ title: 'Boodschappen halen voor volgende week donderdag', project_id: 3, priority: 2 }),
  })
  const bij = aangekomen()
  const taak = JSON.parse(bij.body.toString())
  assert.equal(taak.title, 'Boodschappen halen')
  assert.equal(taak.due_date, new Date(2026, 10, 19, 12, 0).toISOString())
  assert.equal(taak.project_id, 3, 'overige velden blijven staan')
  assert.equal(taak.priority, 2)
  assert.equal(bij.headers.authorization, 'Bearer voorbeeld-token', 'inlogtoken wordt doorgegeven')
  assert.equal(Number(bij.headers['content-length']), bij.body.length, 'content-length klopt met de nieuwe body')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), taak)
})

test('"geen datum" van Vikunja (0001-01-01) telt als geen deadline', async () => {
  await fetch(url('/api/v1/projects/3/tasks'), {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: json({ title: 'Tandarts bellen morgen', due_date: '0001-01-01T00:00:00Z' }),
  })
  const taak = JSON.parse(aangekomen().body.toString())
  assert.equal(taak.title, 'Tandarts bellen')
  assert.equal(taak.due_date, new Date(2026, 10, 12, 12, 0).toISOString())
})

test('bestaande deadline wordt niet overschreven', async () => {
  const oorspronkelijk = json({ title: 'Tandarts bellen morgen', due_date: '2026-11-20T10:00:00Z' })
  await fetch(url('/api/v1/projects/3/tasks'), { method: 'PUT', headers: JSON_HEADERS, body: oorspronkelijk })
  assert.equal(aangekomen().body.toString(), oorspronkelijk)
})

test('titel zonder datum gaat byte-voor-byte ongewijzigd door', async () => {
  const oorspronkelijk = '{ "title" :  "Boodschappen halen",  "project_id":3 }'
  await fetch(url('/api/v1/projects/3/tasks'), { method: 'PUT', headers: JSON_HEADERS, body: oorspronkelijk })
  assert.equal(aangekomen().body.toString(), oorspronkelijk)
})

test('escape-teken ~: geen datum, teken verdwijnt uit de titel', async () => {
  await fetch(url('/api/v1/projects/3/tasks'), { method: 'PUT', headers: JSON_HEADERS, body: json({ title: '~Mei bellen donderdag' }) })
  const taak = JSON.parse(aangekomen().body.toString())
  assert.equal(taak.title, 'Mei bellen donderdag')
  assert.equal('due_date' in taak, false)
})

test('kapotte JSON gaat ongewijzigd door, Vikunja geeft zelf de fout', async () => {
  const kapot = '{"title": "Boodschappen donderdag"'
  const res = await fetch(url('/api/v1/projects/3/tasks'), { method: 'PUT', headers: JSON_HEADERS, body: kapot })
  assert.equal(aangekomen().body.toString(), kapot)
  assert.equal(res.status, 200)
})

test('ingepakte (gzip) aanvraag wordt niet aangeraakt', async () => {
  const oorspronkelijk = json({ title: 'Boodschappen halen donderdag' })
  await fetch(url('/api/v1/projects/3/tasks'), {
    method: 'PUT',
    headers: { ...JSON_HEADERS, 'content-encoding': 'gzip' },
    body: oorspronkelijk,
  })
  assert.equal(aangekomen().body.toString(), oorspronkelijk)
})

for (const [methode, pad] of [
  ['POST', '/api/v1/tasks/5'], // taak bijwerken
  ['PUT', '/api/v1/projects'], // project aanmaken
  ['PUT', '/api/v1/projects/3'],
  ['POST', '/api/v1/projects/3/tasks'], // niet de aanmaak-route
  ['PUT', '/api/v1/projects/abc/tasks'],
]) {
  test(`${methode} ${pad} wordt niet herschreven`, async () => {
    const oorspronkelijk = json({ title: 'Boodschappen halen donderdag' })
    await fetch(url(pad), { method: methode, headers: JSON_HEADERS, body: oorspronkelijk })
    assert.equal(aangekomen().body.toString(), oorspronkelijk)
  })
}

test('gewone verzoeken: query, statuscode, meerdere cookies en eigen headers komen door', async () => {
  const res = await fetch(url('/api/v1/tasks?filter=done%3Dfalse&page=2'), { headers: { authorization: 'Bearer x' } })
  const bij = aangekomen()
  assert.equal(bij.method, 'GET')
  assert.equal(bij.url, '/api/v1/tasks?filter=done%3Dfalse&page=2')
  assert.ok(bij.headers['x-forwarded-for'], 'x-forwarded-for wordt gezet')
  assert.deepEqual(res.headers.getSetCookie(), ['a=1; Path=/', 'b=2; Path=/'])
  assert.equal(res.headers.get('x-eigen'), 'ja')

  const nee = await fetch(url('/api/v1/niet-gevonden'))
  assert.equal(nee.status, 404)
  assert.deepEqual(await nee.json(), { message: 'nee' })
})

test('groot binair bestand (bijlage) komt identiek door', async () => {
  const bestand = randomBytes(2 * 1024 * 1024)
  const res = await fetch(url('/api/v1/tasks/1/attachments'), {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: bestand,
  })
  assert.ok(aangekomen().body.equals(bestand), 'upload identiek')
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(bestand), 'download identiek')
})

test('health-controle', async () => {
  const res = await fetch(url('/__nl-datum/health'))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).status, 'ok')
  assert.equal(ontvangen.length, 0, 'wordt niet naar Vikunja doorgestuurd')
})

test('Vikunja onbereikbaar: nette 502 in JSON', async () => {
  const tijdelijk = http.createServer()
  const vrijePoort = await luister(tijdelijk)
  await new Promise((r) => tijdelijk.close(r))

  const kapotteProxy = createProxy({ upstream: `http://127.0.0.1:${vrijePoort}`, now: () => NU })
  const poort = await luister(kapotteProxy)
  try {
    const res = await fetch(`http://127.0.0.1:${poort}/api/v1/info`)
    assert.equal(res.status, 502)
    assert.match((await res.json()).message, /niet bereikbaar/)
  } finally {
    kapotteProxy.closeAllConnections()
    kapotteProxy.close()
  }
})
