import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTitle, markeerDatum } from '../src/parse.js'

process.env.TZ = 'Europe/Amsterdam'

// Woensdag 11 november 2026, 09:00 (lokale tijd)
const NU = new Date(2026, 10, 11, 9, 0, 0)

const p2 = (n) => String(n).padStart(2, '0')
const fmt = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`

const HERKEND = [
  ['Boodschappen halen voor volgende week donderdag', 'Boodschappen halen', '2026-11-19 12:00'],
  ['Boodschappen halen donderdag', 'Boodschappen halen', '2026-11-12 12:00'],
  ['Donderdag boodschappen halen', 'Boodschappen halen', '2026-11-12 12:00'],
  ['Tandarts bellen morgen', 'Tandarts bellen', '2026-11-12 12:00'],
  ['Overmorgen tandarts', 'Tandarts', '2026-11-13 12:00'],
  ['Rapport afmaken over 3 dagen', 'Rapport afmaken', '2026-11-14 12:00'],
  ['Cadeau kopen voor 25 december', 'Cadeau kopen', '2026-12-25 12:00'],
  ['Vergadering voorbereiden vrijdag om 14:00', 'Vergadering voorbereiden', '2026-11-13 14:00'],
  ['Afspraak maandag 9 uur', 'Afspraak', '2026-11-16 09:00'],
  ['Sporten vanavond', 'Sporten', '2026-11-11 20:00'],
  ['Vandaag wasmachine repareren', 'Wasmachine repareren', '2026-11-11 12:00'],
  ['Auto APK volgende maand', 'Auto APK', '2026-12-11 12:00'],
  ['Belasting aangifte eind van de maand', 'Belasting aangifte', '2026-11-30 12:00'],
  ['Dit weekend de garage opruimen', 'De garage opruimen', '2026-11-14 12:00'],
  ['Huur betalen 31-12', 'Huur betalen', '2026-12-31 12:00'],
  ['Contract tekenen 31-12-2026', 'Contract tekenen', '2026-12-31 12:00'],
  ['Rapport inleveren op 3 december 2026', 'Rapport inleveren', '2026-12-03 12:00'],
  ['Tandarts (donderdag)', 'Tandarts', '2026-11-12 12:00'],
  ['Boodschappen halen, volgende week donderdag', 'Boodschappen halen', '2026-11-19 12:00'],
  ['Uiterlijk op vrijdag rapport versturen', 'Rapport versturen', '2026-11-13 12:00'],
]

for (const [invoer, titel, deadline] of HERKEND) {
  test(`herkent: ${invoer}`, () => {
    const r = parseTitle(invoer, NU)
    assert.ok(r, 'er had een datum herkend moeten worden')
    assert.equal(r.title, titel)
    assert.equal(fmt(r.due), deadline)
  })
}

const NIET_AANRAKEN = [
  'Zo snel mogelijk antwoord geven',
  'Ma bellen',
  'Di en Do ophalen',
  'Wo is de nieuwe baas',
  'Mei bellen over de factuur',
  'Nu of nooit boek lezen',
  'Vrij nemen',
  'Boodschappen halen',
  'Kamer 2 schilderen',
  'Dag 1 plannen',
  'Hoofdstuk 2-3 lezen',
  'Maandag of dinsdag bellen', // twee datums: te onduidelijk
  'Notities van vorige week uitwerken', // verleden is geen deadline
  'Donderdag', // titel zou leeg worden
  '',
  '   ',
]

for (const invoer of NIET_AANRAKEN) {
  test(`laat met rust: ${JSON.stringify(invoer)}`, () => {
    assert.equal(parseTitle(invoer, NU), null)
  })
}

test('escape-teken ~ zet herkenning uit en verdwijnt zelf uit de titel', () => {
  assert.deepEqual(parseTitle('~Mei bellen', NU), { title: 'Mei bellen', due: null })
  assert.deepEqual(parseTitle('~Boodschappen halen donderdag', NU), { title: 'Boodschappen halen donderdag', due: null })
  assert.equal(parseTitle('~', NU), null)
})

test('~ vlak voor één datum negeert alleen die datum, het ~-teken verdwijnt', () => {
  assert.deepEqual(parseTitle('Boodschappen halen ~donderdag', NU), { title: 'Boodschappen halen donderdag', due: null })
  assert.deepEqual(parseTitle('Mei bellen ~morgen', NU), { title: 'Mei bellen morgen', due: null })
})

test('~ voor de ene datum, de andere datum blijft gewoon werken', () => {
  const r = parseTitle('Verhuizen vrijdag ~zaterdag', NU)
  assert.equal(r.title, 'Verhuizen zaterdag')
  assert.equal(fmt(r.due), '2026-11-13 12:00')
})

test('~ vooraan een titel die alleen uit een genegeerde datum bestaat laat de tekst staan', () => {
  assert.equal(parseTitle('~donderdag', NU).title, 'donderdag')
})

test('markeerDatum geeft de positie van de herkende tekst', () => {
  const titel = 'Boodschappen halen voor volgende week donderdag'
  const m = markeerDatum(titel, NU)
  assert.equal(titel.slice(m.index, m.eind), 'volgende week donderdag')
  assert.equal(fmt(m.due), '2026-11-19 12:00')

  const t2 = 'Donderdag boodschappen halen'
  const m2 = markeerDatum(t2, NU)
  assert.equal(t2.slice(m2.index, m2.eind), 'Donderdag')
})

test('markeerDatum markeert precies wat parseTitle ook echt omzet', () => {
  for (const [invoer] of HERKEND) assert.ok(markeerDatum(invoer, NU), `moet markeren: ${invoer}`)
  for (const invoer of NIET_AANRAKEN) assert.equal(markeerDatum(invoer, NU), null, `mag niet markeren: ${invoer}`)
})

test('markeerDatum markeert niets bij ~ (hele titel of één datum)', () => {
  assert.equal(markeerDatum('~Mei bellen donderdag', NU), null)
  assert.equal(markeerDatum('Boodschappen halen ~donderdag', NU), null)
})

test('standaardtijd is instelbaar', () => {
  const r = parseTitle('Rapport morgen', NU, { defaultTime: '17:30' })
  assert.equal(fmt(r.due), '2026-11-12 17:30')
})

test('ongeldige standaardtijd valt terug op 12:00', () => {
  const r = parseTitle('Rapport morgen', NU, { defaultTime: 'kwart over drie' })
  assert.equal(fmt(r.due), '2026-11-12 12:00')
})

test('"vandaag" na de standaardtijd wordt einde van de dag, niet meteen te laat', () => {
  const middag = new Date(2026, 10, 11, 15, 0, 0)
  const r = parseTitle('Vandaag wasmachine repareren', middag)
  assert.equal(fmt(r.due), '2026-11-11 23:59')
})

test('datum zonder jaar die al voorbij is, gaat naar volgend jaar', () => {
  const r = parseTitle('Verjaardag opa 5-3', NU)
  assert.equal(fmt(r.due), '2027-03-05 12:00')
})

test('onmogelijke datum (31-02) wordt genegeerd', () => {
  assert.equal(parseTitle('Iets doen 31-02-2027', NU), null)
})

test('hoofdletter van de originele titel blijft behouden', () => {
  assert.equal(parseTitle('morgen tandarts bellen', NU).title, 'tandarts bellen')
  assert.equal(parseTitle('Morgen tandarts bellen', NU).title, 'Tandarts bellen')
})
