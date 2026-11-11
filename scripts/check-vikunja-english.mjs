// Controleert dat de Nederlandse herkenning Vikunja's Engelse invoer met rust laat.
//
// Leest Vikunja's testbestand voor Quick Add Magic ALLEEN ALS TEKST (er wordt niets
// uit Vikunja uitgevoerd), haalt alle tekstregels eruit en laat parseTitle daarop los.
// Op Engelse invoer hoort de Nederlandse herkenning niets te doen (null): dan valt het
// door naar Vikunja's eigen Engelse herkenning, en blijven al zijn tests slagen.
//
//   node scripts/check-vikunja-english.mjs <pad naar quickAddMagic.test.ts>
//
// Haal het testbestand zo op (voor een gekozen versie):
//   gh api "repos/go-vikunja/vikunja/contents/frontend/src/modules/quickAddMagic/quickAddMagic.test.ts?ref=v2.8.0" \
//     --jq .content | base64 -d > quickAddMagic.test.ts

import { readFileSync } from 'node:fs'
import { parseTitle, markeerDatum } from '../src/parse.js'

process.env.TZ ||= 'Europe/Amsterdam'

const pad = process.argv[2]
if (!pad) {
  console.error('Gebruik: node scripts/check-vikunja-english.mjs <pad naar quickAddMagic.test.ts>')
  process.exit(2)
}

const tekst = readFileSync(pad, 'utf8')
const literalen = new Set()
for (const m of tekst.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
  const s = m[2].replace(/\\(['"`\\])/g, '$1')
  if (s.length >= 3 && /[\p{L}\p{N}]/u.test(s) && !s.includes('${')) literalen.add(s)
}

// Meerdere peildata, want de tests lopen over het jaar en "in het verleden" hangt daarvan af.
const PEILDATA = [new Date(2026, 10, 11, 9, 0, 0), new Date(2021, 5, 24, 9, 0, 0), new Date(2027, 1, 3, 16, 30, 0)]

const afwijkend = []
for (const s of literalen) {
  for (const nu of PEILDATA) {
    const r = parseTitle(s, nu)
    const m = markeerDatum(s, nu)
    if (r !== null || m !== null) {
      afwijkend.push({ s, titel: r?.title ?? null, due: r?.due ? r.due.toISOString() : null })
      break
    }
  }
}

console.log(`${literalen.size} tekstregels uit het testbestand gecontroleerd`)
if (afwijkend.length === 0) {
  console.log('Geen enkele regel wordt door de Nederlandse herkenning aangeraakt.')
} else {
  console.log(`${afwijkend.length} regels worden wel aangeraakt:`)
  for (const a of afwijkend) console.log(`  ${JSON.stringify(a.s)}  ->  titel ${JSON.stringify(a.titel)}, deadline ${a.due}`)
  process.exitCode = 1
}
