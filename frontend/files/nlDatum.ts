// Nederlandse datums in Quick Add Magic ("volgende week donderdag").
// De regels staan in nlDatum.generated.js (vikunja-nl-datum, src/parse.js).

import {getUserDefaultTimeParts} from '@/helpers/time/getDateWithTime'
import {markeerDatum, parseTitle} from './nlDatum.generated'

/** Vikunja's standaardtijd voor datums zonder tijd; zonder instelling 12:00. */
function defaultTime(): string {
	try {
		const parts = getUserDefaultTimeParts()
		if (parts !== null) {
			return `${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}`
		}
	} catch {
		// Geen actieve store (bijvoorbeeld in een test): standaardtijd gebruiken.
	}
	return '12:00'
}

/**
 * Zet een taaktitel om. null = niets te doen.
 * due === null = alleen ~-tekens weggehaald (de herkenning stond uit voor deze titel).
 */
export function parseNlTitle(text: string, now: Date = new Date()): {title: string, due: Date | null} | null {
	return parseTitle(text, now, {defaultTime: defaultTime()})
}

/** Welk stuk van de tekst wordt als datum herkend? Voor het markeren in het invoerveld. */
export function findNlDate(text: string, now: Date = new Date()): {index: number, eind: number, due: Date} | null {
	return markeerDatum(text, now, {defaultTime: defaultTime()})
}
