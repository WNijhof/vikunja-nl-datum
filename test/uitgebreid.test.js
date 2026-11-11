import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTitle, markeerDatum } from '../src/parse.js'
import { herschrijfTaak } from '../src/proxy.js'
import * as browserBundel from '../frontend/files/nlDatum.generated.js'
import { POSITIEF, NEGATIEF, TILDE, nu } from './data/uitgebreid.js'

process.env.TZ = 'Europe/Amsterdam'

const NU = nu(2026, 11, 11)
const p2 = (n) => String(n).padStart(2, '0')
export const fmt = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`

for (const [groep, gevallen] of Object.entries(POSITIEF)) {
  describe(`herkent: ${groep}`, () => {
    for (const [invoer, titel, deadline, eigenNu] of gevallen) {
      test(invoer, () => {
        const r = parseTitle(invoer, eigenNu ?? NU)
        assert.ok(r, 'er had een datum herkend moeten worden')
        assert.equal(r.title, titel)
        assert.equal(r.due && fmt(r.due), deadline)
        const m = markeerDatum(invoer, eigenNu ?? NU)
        assert.ok(m, 'markeerDatum had dezelfde datum moeten vinden')
        assert.equal(fmt(m.due), deadline)
      })
    }
  })
}

for (const [groep, gevallen] of Object.entries(NEGATIEF)) {
  describe(`laat met rust: ${groep}`, () => {
    for (const [invoer, eigenNu] of gevallen) {
      test(JSON.stringify(invoer), () => {
        assert.equal(parseTitle(invoer, eigenNu ?? NU), null)
        assert.equal(markeerDatum(invoer, eigenNu ?? NU), null)
      })
    }
  })
}

describe('~ (negeren)', () => {
  for (const [invoer, verwacht] of TILDE) {
    test(JSON.stringify(invoer), () => {
      const r = parseTitle(invoer, NU)
      if (verwacht === null) return assert.equal(r, null)
      assert.ok(r, 'verwacht een resultaat')
      assert.equal(r.title, verwacht.title)
      assert.equal(r.due && fmt(r.due), verwacht.due)
    })
  }
})

describe('onverwachte soorten invoer geven nooit een fout', () => {
  for (const waarde of [null, undefined, 0, 42, true, {}, [], ['morgen'], () => 'morgen', Symbol.iterator.toString()]) {
    test(`type ${Object.prototype.toString.call(waarde)}`, () => {
      assert.equal(parseTitle(waarde, NU), null)
      assert.equal(markeerDatum(waarde, NU), null)
    })
  }

  test('zeer lange titel met datum achteraan is snel genoeg', () => {
    const titel = `${'Boodschappen halen en meer dingen doen '.repeat(2500)}morgen`
    const t0 = Date.now()
    const r = parseTitle(titel, NU)
    assert.ok(Date.now() - t0 < 2000, 'duurde te lang')
    assert.ok(r && r.title.startsWith('Boodschappen halen'))
  })

  test('rare herhalingen veroorzaken geen vastlopen (ReDoS)', () => {
    const t0 = Date.now()
    for (const s of ['kwart over '.repeat(2000), 'half '.repeat(5000), 'om '.repeat(5000), `${'1'.repeat(20000)}u`, `${'a '.repeat(20000)}morgen`, "'s ".repeat(5000)]) {
      parseTitle(s, NU)
    }
    assert.ok(Date.now() - t0 < 5000, 'duurde te lang')
  })

  test('tekens van twee eenheden (emoji) rondom de datum kloppen met de posities', () => {
    const titel = '😀😀 Bellen morgen 😀😀'
    const m = markeerDatum(titel, NU)
    assert.equal(titel.slice(m.index, m.eind), 'morgen')
  })
})

describe('herschrijfTaak (de proxy)', () => {
  const basis = { title: 'Bellen morgen', project_id: 3, labels: [{ id: 1 }], reminders: [{ relative_to: 'due_date' }] }

  for (const [naam, due] of [['ontbreekt', undefined], ['null', null], ['leeg', ''], ['Vikunja\'s "geen datum"', '0001-01-01T00:00:00Z']]) {
    test(`due_date ${naam}: wel herschreven`, () => {
      const taak = { ...basis, ...(due === undefined ? {} : { due_date: due }) }
      const nieuw = herschrijfTaak(taak, { now: NU })
      assert.equal(nieuw.title, 'Bellen')
      assert.equal(fmt(new Date(nieuw.due_date)), '2026-11-12 12:00')
    })
  }

  test('bestaande due_date: niet aangeraakt', () => {
    assert.equal(herschrijfTaak({ ...basis, due_date: '2026-11-20T10:00:00Z' }, { now: NU }), null)
  })

  test('overige velden blijven staan en het origineel wordt niet gewijzigd', () => {
    const taak = structuredClone(basis)
    const nieuw = herschrijfTaak(taak, { now: NU })
    assert.deepEqual(taak, basis)
    assert.equal(nieuw.project_id, 3)
    assert.deepEqual(nieuw.labels, basis.labels)
    assert.deepEqual(nieuw.reminders, basis.reminders)
  })

  for (const [naam, taak] of [['zonder titel', { project_id: 3 }], ['titel is geen tekst', { title: 5 }], ['null', null], ['een lijst', [{ title: 'morgen bellen' }]], ['tekst', 'morgen']]) {
    test(`ongeldige taak (${naam}): niets doen`, () => {
      assert.equal(herschrijfTaak(taak, { now: NU }), null)
    })
  }

  test('due_date is een geldige ISO-tijd die terug naar dezelfde tijd leest', () => {
    const nieuw = herschrijfTaak(basis, { now: NU })
    assert.match(nieuw.due_date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    assert.equal(new Date(nieuw.due_date).toISOString(), nieuw.due_date)
  })
})

describe('de webpagina-bundel doet precies hetzelfde als de server', () => {
  const alle = [
    ...Object.values(POSITIEF).flat().map(([i, , , n]) => [i, n ?? NU]),
    ...Object.values(NEGATIEF).flat().map(([i, n]) => [i, n ?? NU]),
    ...TILDE.map(([i]) => [i, NU]),
  ]
  test(`${alle.length} invoeren, parseTitle en markeerDatum gelijk`, () => {
    for (const [invoer, n] of alle) {
      assert.deepEqual(browserBundel.parseTitle(invoer, n), parseTitle(invoer, n), `parseTitle: ${JSON.stringify(invoer)}`)
      assert.deepEqual(browserBundel.markeerDatum(invoer, n), markeerDatum(invoer, n), `markeerDatum: ${JSON.stringify(invoer)}`)
    }
  })
})
