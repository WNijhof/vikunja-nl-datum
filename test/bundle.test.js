import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bundel, UIT } from '../scripts/bundle-frontend.mjs'
import * as browserBundel from '../frontend/files/nlDatum.generated.js'
import { parseTitle, markeerDatum } from '../src/parse.js'

process.env.TZ = 'Europe/Amsterdam'

const NU = new Date(2026, 10, 11, 9, 0, 0)

test('de gebundelde webpagina-code loopt niet achter op src/parse.js', async () => {
  const opSchijf = readFileSync(new URL(`../${UIT}`, import.meta.url), 'utf8')
  assert.equal(
    opSchijf,
    await bundel(),
    'src/parse.js is gewijzigd: draai "npm run bundle:frontend" en commit het resultaat',
  )
})

const TITELS = [
  'Boodschappen halen voor volgende week donderdag',
  'Donderdag boodschappen halen',
  'Tandarts bellen morgen',
  'Overmorgen tandarts',
  'Vergadering voorbereiden vrijdag om 14:00',
  'Huur betalen 31-12',
  'Belasting aangifte eind van de maand',
  'Boodschappen halen ~donderdag',
  'Verhuizen vrijdag ~zaterdag',
  '~Mei bellen over de factuur',
  'Zo snel mogelijk antwoord geven',
  'Maandag of dinsdag bellen',
  'Donderdag',
  '',
]

test('de webpagina-bundel doet precies hetzelfde als de server', () => {
  for (const titel of TITELS) {
    assert.deepEqual(browserBundel.parseTitle(titel, NU), parseTitle(titel, NU), `parseTitle: ${titel}`)
    assert.deepEqual(browserBundel.markeerDatum(titel, NU), markeerDatum(titel, NU), `markeerDatum: ${titel}`)
  }
})

test('de bundel exporteert wat Vikunja-kant nodig heeft', () => {
  assert.deepEqual(Object.keys(browserBundel).sort(), ['ESCAPE_TEKEN', 'markeerDatum', 'parseTitle'])
})
