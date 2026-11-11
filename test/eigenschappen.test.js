// Eigenschappen die voor ELKE gegenereerde zin moeten kloppen, ongeacht de precieze invoer.
// De zinnen worden gemaakt met een vaste "toevalsgenerator" (zelfde reeks bij elke run), dus een
// mislukte test is altijd te herhalen.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTitle, markeerDatum } from '../src/parse.js'
import * as browserBundel from '../frontend/files/nlDatum.generated.js'

process.env.TZ = 'Europe/Amsterdam'

function maakToeval(zaad) {
  let a = zaad >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ONDERWERPEN = [
  'Tandarts bellen', 'Rapport schrijven', 'Boodschappen halen', 'Auto laten keuren', 'Cadeau kopen',
  'Vergadering voorbereiden', 'Wasmachine repareren', 'Fietsband plakken', 'Belastingaangifte doen',
  'Café reserveren', 'Project afronden', 'Mail beantwoorden', '📞 Jan terugbellen', 'Oma bezoeken, met bloemen',
]

// Datums die zonder voorzetsel al "echt Nederlands" zijn
const DATUMS = [
  'morgen', 'overmorgen', 'vandaag', 'vrijdag', 'zondag', 'komende vrijdag', 'volgende week donderdag', 'vrijdag volgende week',
  'over 3 dagen', 'over twee weken', 'over een week', 'volgende maand', 'dit weekend', 'volgend weekend', 'eind van de maand',
  'eind van de week', 'begin volgend jaar', '31-12', '5-3-{JAAR}', '1 januari', '5 mrt', 'vanavond', 'morgenochtend',
  'donderdagavond', 'zaterdagochtend', 'maandag om 9 uur', 'vrijdag 14u', 'woensdag om kwart over 2', 'zaterdag om half 3',
  'over een half uur', 'over een kwartier', 'morgen om 14:00', 'overmorgen om 10:00', '31-12 om 23:59', 'volgende week donderdag om half 3',
]
// Datums waarvan de woorden ook Engels zijn: alleen met een Nederlands voorzetsel ervoor
const DATUMS_MET_VOORZETSEL = ['25 december', '15 november', '3 december {JAAR}', '30 april']
const VOORZETSELS = ['voor', 'op', 'uiterlijk', 'tegen']

const VORMEN = [
  (s, d) => `${s} ${d}`,
  (s, d) => `${d} ${s}`,
  (s, d) => `${s} (${d})`,
  (s, d) => `${s} - ${d}`,
  (s, d) => `${d}: ${s}`,
  (s, d) => `${d}, ${s}`,
  (s, d) => `${s} ${d}!`,
  (s, d) => `${s} ${d}.`,
  (s, d) => `${s} voor ${d}`,
  (s, d) => `${s} uiterlijk ${d}`,
  (s, d) => `${s} ${d} nog`,
]

const PEILMOMENTEN = [
  new Date(2026, 10, 11, 9, 0), new Date(2026, 10, 14, 11, 30), new Date(2026, 10, 15, 22, 15), new Date(2026, 11, 31, 8, 0),
  new Date(2027, 0, 31, 9, 0), new Date(2028, 1, 28, 10, 0), new Date(2026, 2, 28, 23, 0), new Date(2026, 9, 24, 23, 30),
  new Date(2026, 10, 16, 0, 5), new Date(2026, 10, 11, 23, 58),
]

function kies(toeval, lijst) {
  return lijst[Math.floor(toeval() * lijst.length)]
}

function maakZinnen(aantal, zaad) {
  const toeval = maakToeval(zaad)
  const zinnen = []
  for (let i = 0; i < aantal; i++) {
    const onderwerp = kies(toeval, ONDERWERPEN)
    const nu = kies(toeval, PEILMOMENTEN)
    let datum
    let metVoorzetsel = false
    if (toeval() < 0.15) {
      datum = `${kies(toeval, VOORZETSELS)} ${kies(toeval, DATUMS_MET_VOORZETSEL)}`
      metVoorzetsel = true
    } else {
      datum = kies(toeval, DATUMS)
    }
    // Een voorzetsel-vorm met een voorzetsel erin hoeft niet nog een voorzetsel te krijgen
    datum = datum.replace('{JAAR}', String(nu.getFullYear() + 1))
    let vorm = kies(toeval, VORMEN)
    if (metVoorzetsel) vorm = kies(toeval, VORMEN.filter((_, n) => n !== 8 && n !== 9))
    if (/^\d{1,2}-\d{1,2}$/.test(datum)) vorm = kies(toeval, VORMEN.filter((_, n) => n !== 10)) // niet midden in de zin
    let zin = vorm(onderwerp, datum)
    const wijziging = toeval()
    if (wijziging < 0.15) zin = zin.toLowerCase()
    else if (wijziging < 0.25) zin = zin.toUpperCase()
    else if (wijziging < 0.35) zin = zin.replace(/ /, '  ') // dubbele spatie
    zinnen.push({ zin, onderwerp, nu })
  }
  return zinnen
}

const AANTAL = 4000
const ZINNEN = maakZinnen(AANTAL, 20261111)

function eerste(lijst, max = 8) {
  return lijst.slice(0, max).map((x) => `  ${x}`).join('\n') + (lijst.length > max ? `\n  ... en nog ${lijst.length - max}` : '')
}

describe(`${AANTAL} gegenereerde zinnen`, () => {
  test('geven nooit een fout, en herkennen altijd een datum', () => {
    const mis = []
    for (const { zin, nu } of ZINNEN) {
      let r
      try {
        r = parseTitle(zin, nu)
      } catch (err) {
        mis.push(`FOUT ${JSON.stringify(zin)}: ${err.message}`)
        continue
      }
      if (!r || !r.due) mis.push(`GEEN DATUM ${JSON.stringify(zin)} (nu ${nu.toISOString()})`)
    }
    assert.equal(mis.length, 0, `${mis.length} zinnen:\n${eerste(mis)}`)
  })

  test('de titel is netjes: niet leeg, geen dubbele of losse spaties of leestekens aan de rand', () => {
    const mis = []
    for (const { zin, nu } of ZINNEN) {
      const r = parseTitle(zin, nu)
      if (!r) continue
      const t = r.title
      if (!t || t !== t.trim()) mis.push(`LEEG/RAND ${JSON.stringify(zin)} -> ${JSON.stringify(t)}`)
      else if (/\s{2,}/.test(t)) mis.push(`DUBBELE SPATIE ${JSON.stringify(zin)} -> ${JSON.stringify(t)}`)
      else if (/^[,;:\-–—]|[,;:\-–—]$/.test(t)) mis.push(`LEESTEKEN AAN DE RAND ${JSON.stringify(zin)} -> ${JSON.stringify(t)}`)
      else if (/\s[,;:!?.)]/.test(t) || /,,|\(\s*\)/.test(t)) mis.push(`LOS LEESTEKEN ${JSON.stringify(zin)} -> ${JSON.stringify(t)}`)
    }
    assert.equal(mis.length, 0, `${mis.length} zinnen:\n${eerste(mis)}`)
  })

  test('het onderwerp blijft helemaal behouden (er wordt nooit iets van de eigenlijke titel opgegeten)', () => {
    const mis = []
    for (const { zin, onderwerp, nu } of ZINNEN) {
      const r = parseTitle(zin, nu)
      if (r && !r.title.toLowerCase().includes(onderwerp.toLowerCase().replace(/\s+/g, ' '))) {
        mis.push(`${JSON.stringify(zin)} -> ${JSON.stringify(r.title)} (onderwerp ${JSON.stringify(onderwerp)})`)
      }
    }
    assert.equal(mis.length, 0, `${mis.length} zinnen:\n${eerste(mis)}`)
  })

  test('de deadline is een geldig moment, niet in het verleden en binnen twee jaar', () => {
    const mis = []
    for (const { zin, nu } of ZINNEN) {
      const r = parseTitle(zin, nu)
      if (!r?.due) continue
      const t = r.due.getTime()
      const dagBegin = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime()
      if (Number.isNaN(t)) mis.push(`ONGELDIG ${JSON.stringify(zin)}`)
      else if (t < dagBegin) mis.push(`VERLEDEN ${JSON.stringify(zin)} -> ${r.due.toISOString()} (nu ${nu.toISOString()})`)
      else if (t > nu.getTime() + 2 * 366 * 86400000) mis.push(`TE VER ${JSON.stringify(zin)} -> ${r.due.toISOString()}`)
    }
    assert.equal(mis.length, 0, `${mis.length} zinnen:\n${eerste(mis)}`)
  })

  test('markeerDatum en parseTitle zijn het altijd eens, en de markering wijst echte tekst aan', () => {
    const mis = []
    for (const { zin, nu } of ZINNEN) {
      const r = parseTitle(zin, nu)
      const m = markeerDatum(zin, nu)
      if (!!r?.due !== !!m) mis.push(`VERSCHIL ${JSON.stringify(zin)}`)
      else if (m) {
        if (m.due.getTime() !== r.due.getTime()) mis.push(`ANDERE DEADLINE ${JSON.stringify(zin)}`)
        else if (!(m.index >= 0 && m.eind > m.index && m.eind <= zin.length)) mis.push(`POSITIE ${JSON.stringify(zin)} ${m.index}-${m.eind}`)
        else if (zin.slice(m.index, m.eind).trim() === '') mis.push(`LEGE MARKERING ${JSON.stringify(zin)}`)
      }
    }
    assert.equal(mis.length, 0, `${mis.length} zinnen:\n${eerste(mis)}`)
  })

  test('een tweede keer omzetten verandert niets meer (de datum is er echt uit)', () => {
    const mis = []
    for (const { zin, nu } of ZINNEN) {
      const r = parseTitle(zin, nu)
      if (!r) continue
      const nogmaals = parseTitle(r.title, nu)
      if (nogmaals !== null) mis.push(`${JSON.stringify(zin)} -> ${JSON.stringify(r.title)} -> ${JSON.stringify(nogmaals.title)}`)
    }
    assert.equal(mis.length, 0, `${mis.length} zinnen:\n${eerste(mis)}`)
  })

  test('de webpagina-bundel geeft voor elke zin precies hetzelfde als de server', () => {
    const mis = []
    for (const { zin, nu } of ZINNEN) {
      try {
        assert.deepEqual(browserBundel.parseTitle(zin, nu), parseTitle(zin, nu))
        assert.deepEqual(browserBundel.markeerDatum(zin, nu), markeerDatum(zin, nu))
      } catch {
        mis.push(JSON.stringify(zin))
      }
    }
    assert.equal(mis.length, 0, `${mis.length} zinnen:\n${eerste(mis)}`)
  })

  test('met ~ voor de datum wordt die datum nooit meer herkend', () => {
    const mis = []
    for (const { zin, nu } of ZINNEN.slice(0, 1500)) {
      const m = markeerDatum(zin, nu)
      if (!m) continue
      const met = `${zin.slice(0, m.index)}~${zin.slice(m.index)}`
      const r = parseTitle(met, nu)
      // Er mag geen deadline uit komen; het ~-teken moet uit de titel zijn
      if (r?.due) mis.push(`NOG STEEDS DATUM ${JSON.stringify(met)} -> ${JSON.stringify(r)}`)
      else if (r && r.title.includes('~')) mis.push(`~ BLIJFT STAAN ${JSON.stringify(met)} -> ${JSON.stringify(r.title)}`)
    }
    assert.equal(mis.length, 0, `${mis.length} zinnen:\n${eerste(mis)}`)
  })
})

describe('willekeurige tekens', () => {
  test('geven nooit een fout (5000 willekeurige strings van allerlei soorten tekens)', () => {
    const toeval = maakToeval(42)
    const tekens = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \t\n.,;:!?-–—~()[]{}\'"’/\\@#€$%^&*+=<>|`éëüöñçß😀📞中文العربية​\u0000'.normalize()]
    const woorden = ['morgen', 'vrijdag', 'om', 'half', 'kwart', 'over', 'voor', 'uur', "'s", 'middags', '14u', '31-12', 'week', 'volgende', 'eind', 'van', 'de', 'maand', 'elke', '~']
    for (let i = 0; i < 5000; i++) {
      let s = ''
      const lengte = Math.floor(toeval() * 40)
      for (let j = 0; j < lengte; j++) s += toeval() < 0.4 ? ` ${kies(toeval, woorden)} ` : kies(toeval, tekens)
      const nu = PEILMOMENTEN[i % PEILMOMENTEN.length]
      assert.doesNotThrow(() => {
        const r = parseTitle(s, nu)
        const m = markeerDatum(s, nu)
        assert.equal(!!r?.due, !!m, JSON.stringify(s))
        if (r) assert.ok(typeof r.title === 'string' && r.title.length > 0, JSON.stringify(s))
      }, JSON.stringify(s))
    }
  })
})
