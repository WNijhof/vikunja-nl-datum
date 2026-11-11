// Herkent een Nederlandse deadline in de titel van een taak.
//
//   "Boodschappen halen voor volgende week donderdag"
//     -> { title: "Boodschappen halen", due: <do 19 nov 12:00> }
//
// Basis is chrono-node (Nederlandse variant). Daar komen een paar eigen
// patronen bij die chrono mist (overmorgen, dit weekend, eind van de maand,
// 31-12 / 31-12-2026) en een aantal beveiligingen tegen valse treffers
// ("Zo snel mogelijk", "Ma bellen", "Mei bellen over de factuur").

import * as chrono from 'chrono-node'

// Zet een titel die met dit teken begint niet om: "~Mei bellen" blijft "Mei bellen".
export const ESCAPE_TEKEN = '~'

// Een enkel woord telt alleen als datum als het een volledige naam is.
// Zo blijven afkortingen en gewone woorden (zo, ma, di, wo, do, vrij, mei, nu) met rust.
const LOSSE_WOORDEN = new Set([
  'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag',
  'vandaag', 'morgen', 'overmorgen',
  'vanochtend', 'vanmiddag', 'vanavond', 'vannacht',
  'morgenochtend', 'morgenmiddag', 'morgenavond',
])

// Bij deze woorden geeft chrono zelf een tijdstip (vanavond = 20:00); dat laten we staan.
const DAGDEEL = /ochtend|middag|avond|nacht/i

// Voorzetsels die voor de datum staan en samen met de datum uit de titel verdwijnen.
const VOORZETSEL_AAN_HET_EINDE = /(?<![\p{L}])(?:voor|vóór|op|tegen|uiterlijk|per|deadline)\s*:?\s*$/iu

const LETTER_OF_CIJFER = String.raw`[\p{L}\p{N}]`
const GRENS_VOOR = String.raw`(?<!${LETTER_OF_CIJFER})`
const GRENS_NA = String.raw`(?!${LETTER_OF_CIJFER})`

function alsDatum(date) {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

function bestaatDatum(year, month, day) {
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

function beginVanDag(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

const nl = chrono.nl.casual.clone()

nl.parsers.push({
  pattern: () => new RegExp(`${GRENS_VOOR}overmorgen${GRENS_NA}`, 'iu'),
  extract: (context) => {
    const d = new Date(context.refDate)
    d.setDate(d.getDate() + 2)
    return alsDatum(d)
  },
})

// "dit weekend" = de komende zaterdag (op zaterdag en zondag zelf: vandaag)
nl.parsers.push({
  pattern: () => new RegExp(`${GRENS_VOOR}(?:dit|komend(?:e)?|aankomend(?:e)?)\\s+weekend${GRENS_NA}`, 'iu'),
  extract: (context) => {
    const d = new Date(context.refDate)
    const dag = d.getDay()
    if (dag !== 0 && dag !== 6) d.setDate(d.getDate() + (6 - dag))
    return alsDatum(d)
  },
})

// "eind van de maand", "einde deze maand", "eind maand"
nl.parsers.push({
  pattern: () => new RegExp(`${GRENS_VOOR}(?:het\\s+)?einde?\\s+(?:van\\s+)?(?:de\\s+|deze\\s+|die\\s+)?maand${GRENS_NA}`, 'iu'),
  extract: (context) => {
    const ref = context.refDate
    return alsDatum(new Date(ref.getFullYear(), ref.getMonth() + 1, 0))
  },
})

// 31-12-2026, 31/12/2026, 31.12.2026, 31-12-26 (dag-maand-jaar, Nederlandse volgorde)
nl.parsers.push({
  pattern: () => new RegExp(`(?<![\\p{L}\\p{N}\\-/.:])(\\d{1,2})([-/.])(\\d{1,2})\\2(\\d{4}|\\d{2})${GRENS_NA}`, 'iu'),
  extract: (context, match) => {
    const day = Number(match[1])
    const month = Number(match[3])
    const year = match[4].length === 2 ? 2000 + Number(match[4]) : Number(match[4])
    return bestaatDatum(year, month, day) ? { year, month, day } : null
  },
})

// 31-12 of 31/12 zonder jaar. Alleen vooraan of achteraan de titel: midden in een
// zin kan het ook "hoofdstuk 2-3" of een score zijn.
nl.parsers.push({
  pattern: () => new RegExp(`(?<![\\p{L}\\p{N}\\-/.:])(\\d{1,2})([-/])(\\d{1,2})(?![\\p{L}\\p{N}]|[-/.]\\d)`, 'iu'),
  extract: (context, match) => {
    const voor = context.text.slice(0, match.index)
    const na = context.text.slice(match.index + match[0].length)
    if (!(/^\s*$/.test(voor) || /^[\s.,;:!?)]*$/.test(na))) return null
    const day = Number(match[1])
    const month = Number(match[3])
    let year = context.refDate.getFullYear()
    if (!bestaatDatum(year, month, day)) return null
    if (new Date(year, month - 1, day) < beginVanDag(context.refDate)) year += 1
    return bestaatDatum(year, month, day) ? { year, month, day } : null
  },
})

function leesTijd(tekst) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(tekst ?? '')
  if (!m) return { uren: 12, minuten: 0 }
  const uren = Number(m[1])
  const minuten = Number(m[2])
  return uren < 24 && minuten < 60 ? { uren, minuten } : { uren: 12, minuten: 0 }
}

// chrono neemt soms een haakje of leesteken mee in de gevonden tekst ("(donderdag").
// Dat snijden we weg, zodat alleen de echte datumwoorden overblijven.
function kern(r) {
  const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su.exec(r.text)
  return { index: r.index + m[1].length, tekst: m[2] }
}

function isBruikbaar(r, now) {
  if (r.end) return false // een periode ("15 tot 20 november") is geen deadline
  const { tekst } = kern(r)
  if (!/\s/.test(tekst) && !/\d/.test(tekst) && !LOSSE_WOORDEN.has(tekst.toLowerCase())) return false
  if (r.start.date() < beginVanDag(now)) return false // "vorige week" e.d.: verleden is geen deadline
  return true
}

function maakTitelSchoon(titel, index, lengte) {
  let voor = titel.slice(0, index)
  let na = titel.slice(index + lengte)

  // "Tandarts (donderdag)" -> "Tandarts"
  if (/\(\s*$/.test(voor) && /^\s*\)/.test(na)) {
    voor = voor.replace(/\(\s*$/, '')
    na = na.replace(/^\s*\)/, '')
  }
  // "uiterlijk op", "voor", "tegen" enz. direct voor de datum
  for (let i = 0; i < 2; i++) voor = voor.replace(VOORZETSEL_AAN_HET_EINDE, '')

  let schoon = `${voor.trimEnd()} ${na.trimStart()}`
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '')

  // Begon de titel met een hoofdletter, dan blijft dat zo ("Donderdag boodschappen" -> "Boodschappen")
  if (schoon && /\p{Lu}/u.test(titel[0]) && /\p{Ll}/u.test(schoon[0])) {
    schoon = schoon[0].toUpperCase() + schoon.slice(1)
  }
  return schoon
}

/**
 * @param {string} titel
 * @param {Date} [now]
 * @param {{defaultTime?: string}} [opties] defaultTime: "HH:MM" voor datums zonder tijdstip
 * @returns {{title: string, due: Date | null} | null}
 *   null  = niets aanpassen
 *   due === null = alleen de titel aanpassen (escape-teken weghalen)
 */
export function parseTitle(titel, now = new Date(), { defaultTime = '12:00' } = {}) {
  if (typeof titel !== 'string' || !titel.trim()) return null

  if (titel.startsWith(ESCAPE_TEKEN)) {
    const zonder = titel.slice(ESCAPE_TEKEN.length).trimStart()
    return zonder ? { title: zonder, due: null } : null
  }

  const kandidaten = nl
    .parse(titel, now, { forwardDate: true })
    .filter((r) => isBruikbaar(r, now))

  // Meerdere datums in één titel: te onduidelijk, dus niet aanraken.
  if (kandidaten.length !== 1) return null
  const r = kandidaten[0]

  const gevonden = kern(r)
  const title = maakTitelSchoon(titel, gevonden.index, gevonden.tekst.length)
  if (!title) return null // de titel bestond alleen uit een datum

  const due = r.start.date()
  if (!r.start.isCertain('hour') && !DAGDEEL.test(r.text)) {
    const { uren, minuten } = leesTijd(defaultTime)
    due.setHours(uren, minuten, 0, 0)
    // Standaardtijd vandaag al voorbij? Dan einde van de dag, niet meteen "te laat".
    if (beginVanDag(due).getTime() === beginVanDag(now).getTime() && due <= now) {
      due.setHours(23, 59, 0, 0)
    }
  }
  return { title, due }
}
