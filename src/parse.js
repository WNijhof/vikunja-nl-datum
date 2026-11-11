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

// Wij nemen alleen over als er echt Nederlands in de datum staat. Al het andere (Engelse
// invoer, losse tijden als "at 15:00", ISO-datums, 9/11, 31.12.2026, datums in een URL)
// laten we met rust, zodat Vikunja's eigen herkenning het doet en alle Engelse invoer
// precies zo blijft werken als zonder dit project.
//
// "Echt Nederlands" is: een woord dat alleen Nederlands is (niet "december", "week" of
// "weekend", want die zijn in beide talen hetzelfde), een datum als 31-12 of 31-12-2026
// met streepjes, of een Nederlands voorzetsel ("voor", "op", "tegen", "uiterlijk") ervoor.
const NEDERLANDSE_WOORDEN = new Set([
  'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag',
  'vandaag', 'morgen', 'overmorgen', 'vanochtend', 'vanmorgen', 'vanmiddag', 'vanavond', 'vannacht',
  'morgenochtend', 'morgenmiddag', 'morgenavond', 'morgenvroeg',
  'volgende', 'volgend', 'komende', 'komend', 'aankomende', 'aankomend', 'aanstaande', 'eerstvolgende',
  'deze', 'dit',
  'dag', 'dagen', 'weken', 'maand', 'maanden', 'jaar', 'jaren', 'uur', 'minuut', 'minuten',
  'eind', 'einde',
  'om', // "om 15:30"
  'half', 'kwart', 'kwartier', 'anderhalf', 'anderhalve', 'vijf', 'tien', // "half 3", "kwart over 2", "over een half uur"
  'ochtends', 'morgens', 'middags', 'avonds', 'nachts', // "2 uur 's middags"
  'januari', 'februari', 'maart', 'mei', 'juni', 'juli', 'augustus', 'oktober', 'mrt', 'okt',
])
const NEDERLANDS_VOORZETSEL = /(?<![\p{L}])(?:voor|vóór|tegen|uiterlijk|op)\s*:?\s*$/iu
const DATUM_MET_STREEPJES = /^\d{1,2}-\d{1,2}(?:-\d{2}|-\d{4})?$/

const UUR_MET_U = /(?<![\p{L}\p{N}])\d{1,2}u(?:\d{2})?(?![\p{L}\p{N}])/iu // 14u, 14u30

function isNederlands(voorTekst, tekst) {
  if (DATUM_MET_STREEPJES.test(tekst) || UUR_MET_U.test(tekst)) return true
  if ((tekst.toLowerCase().match(/\p{L}+/gu) ?? []).some((w) => NEDERLANDSE_WOORDEN.has(w))) return true
  return NEDERLANDS_VOORZETSEL.test(voorTekst)
}

// Staat de gevonden tekst in een webadres? Dan is het geen datum.
function staatInUrl(titel, index, eind) {
  let begin = index
  while (begin > 0 && !/\s/.test(titel[begin - 1])) begin--
  let einde = eind
  while (einde < titel.length && !/\s/.test(titel[einde])) einde++
  const woord = titel.slice(begin, einde)
  return /:\/\//.test(woord) || /^www\./i.test(woord)
}

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

// ---- Nederlandse kloktijden: "half 3", "kwart over 2", "14u", "over een half uur", "2 uur 's middags" ----

const TELWOORDEN = { een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12 }
const GETAL = String.raw`(\d{1,2}|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf)`
const DAGDEEL_ACHTERAAN = String.raw`(?:\s+['’]s\s+(ochtends|morgens|middags|avonds|nachts))?`

function leesGetal(s) {
  const t = s.toLowerCase()
  return /^\d+$/.test(t) ? Number(t) : TELWOORDEN[t]
}

// Zonder dagdeel: "om 2 uur" bedoelt in het Nederlands bijna altijd 14:00. Uren 1 t/m 7 rekenen we
// als middag/avond, 8 t/m 11 als ochtend, 12 als twaalf uur 's middags, en 13 en hoger blijft zoals getypt.
function uurZonderDagdeel(h) {
  return h >= 1 && h <= 7 ? h + 12 : h
}

function uurMetDagdeel(h, dagdeel) {
  switch (dagdeel.toLowerCase()) {
    case 'ochtends':
    case 'morgens': return h === 12 ? 0 : h
    case 'middags': return h === 12 ? 12 : h + 12
    case 'avonds': return h === 12 ? 0 : h + 12
    default: return h === 12 ? 0 : h >= 6 ? h + 12 : h // nachts: "11 uur 's nachts" is 23:00, "3 uur 's nachts" is 03:00
  }
}

// half 3 = 2:30, kwart over 2 = 2:15, kwart voor 3 = 2:45, tien voor half 3 = 2:20, vijf over half 3 = 2:35
nl.parsers.push({
  pattern: () => new RegExp(
    `${GRENS_VOOR}(?:om\\s+)?(?:(?:(vijf|tien|kwart)\\s+(over|voor)\\s+)(?:(half)\\s+)?|(half)\\s+)${GETAL}${DAGDEEL_ACHTERAAN}${GRENS_NA}`,
    'iu',
  ),
  extract: (context, match) => {
    const [, maatWoord, richting, halfNaMaat, halfAlleen, getalTekst, dagdeel] = match
    const n = leesGetal(getalTekst)
    if (!(n >= 1 && n <= 12)) return null
    const half = Boolean(halfNaMaat || halfAlleen)
    const maat = maatWoord?.toLowerCase()
    if (maat === 'kwart' && half) return null // "kwart over half 3" bestaat niet

    let uur = n
    let minuut = 0
    if (half) {
      uur = n === 1 ? 12 : n - 1
      minuut = 30
    }
    const verschil = { vijf: 5, tien: 10, kwart: 15 }[maat] ?? 0
    if (richting?.toLowerCase() === 'over') {
      minuut += verschil
    } else if (richting?.toLowerCase() === 'voor') {
      minuut -= verschil
      if (minuut < 0) {
        minuut += 60
        uur = uur === 1 ? 12 : uur - 1
      }
    }
    return { hour: dagdeel ? uurMetDagdeel(uur, dagdeel) : uurZonderDagdeel(uur), minute: minuut }
  },
})

// 14u, 14u30, om 9u
nl.parsers.push({
  pattern: () => new RegExp(`${GRENS_VOOR}(?:om\\s+)?(\\d{1,2})u(\\d{2})?${GRENS_NA}`, 'iu'),
  extract: (context, match) => {
    const uur = Number(match[1])
    const minuut = Number(match[2] ?? 0)
    if (uur > 23 || minuut > 59) return null
    return { hour: uur <= 12 ? uurZonderDagdeel(uur) : uur, minute: minuut }
  },
})

// 2 uur 's middags, om 9 uur 's avonds, 3:30 's middags
nl.parsers.push({
  pattern: () => new RegExp(
    `${GRENS_VOOR}(?:om\\s+)?(\\d{1,2})(?:[:.](\\d{2})(?:\\s*uur)?|\\s*uur)\\s+['’]s\\s+(ochtends|morgens|middags|avonds|nachts)${GRENS_NA}`,
    'iu',
  ),
  extract: (context, match) => {
    const uur = Number(match[1])
    const minuut = Number(match[2] ?? 0)
    if (uur < 1 || uur > 12 || minuut > 59) return null
    return { hour: uurMetDagdeel(uur, match[3]), minute: minuut }
  },
})

// over een half uur, over een kwartier, over drie kwartier, over anderhalf uur
nl.parsers.push({
  pattern: () => new RegExp(
    `${GRENS_VOOR}over\\s+(?:een\\s+)?(half\\s+uur|kwartier|drie\\s+kwartier|anderhalf\\s+uur|anderhalve\\s+uur)${GRENS_NA}`,
    'iu',
  ),
  extract: (context, match) => {
    const minuten = { 'half uur': 30, kwartier: 15, 'drie kwartier': 45, 'anderhalf uur': 90, 'anderhalve uur': 90 }[
      match[1].toLowerCase().replace(/\s+/g, ' ')
    ]
    const d = new Date(context.refDate.getTime() + minuten * 60000)
    return { ...alsDatum(d), hour: d.getHours(), minute: d.getMinutes() }
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

// Een los uur van 1 t/m 7 zonder dagdeel ("om 2 uur"), niet de 4 uit "14 uur" of "3:30".
const LOS_UUR_1_T_M_7 = /(?<![\p{N}:.])[1-7]\s*uur(?![\p{L}\p{N}])/iu

function berekenDeadline(r, now, defaultTime) {
  const due = r.start.date()
  if (!r.start.isCertain('hour') && !DAGDEEL.test(r.text)) {
    const { uren, minuten } = leesTijd(defaultTime)
    due.setHours(uren, minuten, 0, 0)
    // Standaardtijd vandaag al voorbij? Dan einde van de dag, niet meteen "te laat".
    if (beginVanDag(due).getTime() === beginVanDag(now).getTime() && due <= now) {
      due.setHours(23, 59, 0, 0)
    }
  } else if (!r.start.isCertain('hour') && /ochtend/i.test(r.text)) {
    due.setHours(9, 0, 0, 0) // chrono rekent 06:00; voor een taak is 9 uur 's ochtends een betere gok
  } else if (
    r.start.isCertain('hour')
    && !/['’]s\s/.test(r.text) // "2 uur 's middags" heeft al een dagdeel
    && !/(?<![\p{L}])over\s/iu.test(r.text) // "over 2 uur" is over twee uur, geen klokslag
    && LOS_UUR_1_T_M_7.test(r.text)
  ) {
    // "vrijdag om 2 uur" is in het Nederlands 14:00, niet 02:00 's nachts.
    due.setHours(due.getHours() + 12)
  }
  return due
}

// Haalt de tekens op de gegeven posities uit een tekst.
function haalWeg(tekst, posities) {
  let uit = ''
  let vorige = 0
  for (const p of [...posities].sort((a, b) => a - b)) {
    uit += tekst.slice(vorige, p)
    vorige = p + 1
  }
  return uit + tekst.slice(vorige)
}

/**
 * Eén analyse die zowel de omzetting (parseTitle) als de markering in de
 * webpagina (markeerDatum) gebruiken, zodat die nooit uit elkaar lopen.
 *
 * Een ~ vlak voor een datum ("Verhuizen ~zaterdag") betekent: deze tekst is
 * geen datum. Een ~ vooraan de titel zet de herkenning voor de hele titel uit.
 *
 * @returns {{
 *   alles_uit: boolean,
 *   actief: {index: number, eind: number, due: Date} | null,
 *   tilde_posities: number[],
 *   title: string | null,
 * }}
 *   alles_uit      ~ vooraan de titel
 *   actief         de ene herkende datum (positie in de oorspronkelijke tekst), of null
 *   tilde_posities de ~-tekens voor genegeerde datums; die verdwijnen uit de titel
 *   title          de titel na omzetting (zonder datum en zonder die ~-tekens), of null als er niets verandert
 */
function analyseer(titel, now, defaultTime) {
  const leeg = { alles_uit: false, actief: null, tilde_posities: [], title: null }
  if (typeof titel !== 'string' || !titel.trim()) return leeg

  if (titel.startsWith(ESCAPE_TEKEN)) {
    const zonder = titel.slice(ESCAPE_TEKEN.length).trimStart()
    return { ...leeg, alles_uit: true, title: zonder || null }
  }

  const kandidaten = []
  for (const r of nl.parse(titel, now, { forwardDate: true })) {
    if (!isBruikbaar(r, now)) continue
    const k = kern(r)
    const eind = k.index + k.tekst.length
    const genegeerd = titel[k.index - 1] === ESCAPE_TEKEN
    if (staatInUrl(titel, k.index, eind)) continue
    // Het voorzetsel kijken we vóór een eventuele ~ bij, zodat "voor ~25 december" ook als Nederlands telt.
    if (!isNederlands(titel.slice(0, genegeerd ? k.index - 1 : k.index), k.tekst)) continue
    kandidaten.push({ r, index: k.index, eind, genegeerd })
  }

  const tildes = kandidaten.filter((k) => k.genegeerd).map((k) => k.index - 1)
  const zonderTildes = tildes.length ? haalWeg(titel, tildes) : titel
  const metTildesWeg = tildes.length && zonderTildes.trim() ? zonderTildes : null

  const actief = kandidaten.filter((k) => !k.genegeerd)
  // Meerdere datums in één titel: te onduidelijk, dus niet aanraken.
  if (actief.length !== 1) return { ...leeg, tilde_posities: tildes, title: metTildesWeg }

  const a = actief[0]
  const verschoven = tildes.filter((p) => p < a.index).length
  const title = maakTitelSchoon(zonderTildes, a.index - verschoven, a.eind - a.index)
  // De titel bestond alleen uit een datum: laat alles zoals het is (op de ~-tekens na).
  if (!title) return { ...leeg, tilde_posities: tildes, title: metTildesWeg }

  return {
    alles_uit: false,
    actief: { index: a.index, eind: a.eind, due: berekenDeadline(a.r, now, defaultTime) },
    tilde_posities: tildes,
    title,
  }
}

/**
 * Zet een titel om: haalt de datum eruit en geeft de deadline.
 *
 * @param {string} titel
 * @param {Date} [now]
 * @param {{defaultTime?: string}} [opties] defaultTime: "HH:MM" voor datums zonder tijdstip
 * @returns {{title: string, due: Date | null} | null}
 *   null  = niets aanpassen
 *   due === null = alleen de titel aanpassen (~-tekens weghalen)
 */
export function parseTitle(titel, now = new Date(), { defaultTime = '12:00' } = {}) {
  const { actief, title } = analyseer(titel, now, defaultTime)
  if (title === null) return null
  return { title, due: actief ? actief.due : null }
}

/**
 * Welk stuk van de titel wordt als datum herkend? Voor het markeren in de webpagina.
 *
 * @returns {{index: number, eind: number, due: Date} | null}
 *   index/eind: positie van de herkende tekst in `titel` (titel.slice(index, eind))
 */
export function markeerDatum(titel, now = new Date(), { defaultTime = '12:00' } = {}) {
  return analyseer(titel, now, defaultTime).actief
}
