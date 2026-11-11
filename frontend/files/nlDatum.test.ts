import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {setActivePinia, createPinia} from 'pinia'
import {queryClient} from '@/client/queryClient'
import {accountKeys} from '@/client/queries/account'
import {useAuthStore} from '@/stores/auth'

import {parseTaskText} from '.'
import {findNlDate} from './nlDatum'

function setDefaultDueTime(default_due_time?: string) {
	const authStore = useAuthStore()
	queryClient.setQueryData(accountKeys.user(0), {settings: {
		...authStore.settings,
		frontend_settings: {
			...authStore.settings.frontend_settings,
			default_due_time,
		},
	}})
}

// Woensdag 11 november 2026, 09:00 (lokale tijd)
const NU = new Date(2026, 10, 11, 9, 0, 0)

describe('Nederlandse datums in Quick Add Magic', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(NU)
		queryClient.clear()
		setActivePinia(createPinia())
		useAuthStore()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('herkent "voor volgende week donderdag" en maakt de titel schoon', () => {
		const r = parseTaskText('Boodschappen halen voor volgende week donderdag')
		expect(r.text).toBe('Boodschappen halen')
		expect(r.date).toEqual(new Date(2026, 10, 19, 12, 0, 0))
	})

	it.each([
		['Tandarts bellen morgen', 'Tandarts bellen', new Date(2026, 10, 12, 12, 0, 0)],
		['Overmorgen tandarts', 'Tandarts', new Date(2026, 10, 13, 12, 0, 0)],
		['Vergadering voorbereiden vrijdag om 14:00', 'Vergadering voorbereiden', new Date(2026, 10, 13, 14, 0, 0)],
		['Cadeau kopen voor 25 december', 'Cadeau kopen', new Date(2026, 11, 25, 12, 0, 0)],
		['Belasting aangifte eind van de maand', 'Belasting aangifte', new Date(2026, 10, 30, 12, 0, 0)],
		['Huur betalen 31-12', 'Huur betalen', new Date(2026, 11, 31, 12, 0, 0)],
	])('herkent %s', (invoer, tekst, datum) => {
		const r = parseTaskText(invoer)
		expect(r.text).toBe(tekst)
		expect(r.date).toEqual(datum)
	})

	it('gebruikt de standaardtijd uit de instellingen', () => {
		setDefaultDueTime('17:30')
		expect(parseTaskText('Rapport morgen').date).toEqual(new Date(2026, 10, 12, 17, 30, 0))
	})

	it('laat gewone woorden en afkortingen met rust', () => {
		for (const tekst of ['Zo snel mogelijk antwoord geven', 'Ma bellen', 'Mei bellen over de factuur', 'Vrij nemen']) {
			const r = parseTaskText(tekst)
			expect(r.text).toBe(tekst)
			expect(r.date).toBeNull()
		}
	})

	it('~ vooraan zet de herkenning uit en verdwijnt uit de titel', () => {
		const r = parseTaskText('~Boodschappen halen donderdag')
		expect(r.text).toBe('Boodschappen halen donderdag')
		expect(r.date).toBeNull()
	})

	it('~ voor één datum negeert alleen die datum', () => {
		const r = parseTaskText('Boodschappen halen ~donderdag')
		expect(r.text).toBe('Boodschappen halen donderdag')
		expect(r.date).toBeNull()
	})

	it('~ zet ook de Engelse herkenning uit voor die titel', () => {
		const r = parseTaskText('~Call mom tomorrow')
		expect(r.text).toBe('Call mom tomorrow')
		expect(r.date).toBeNull()
	})

	it('Engelse datums werken nog steeds', () => {
		const r = parseTaskText('Buy milk tomorrow')
		expect(r.text).toBe('Buy milk')
		expect(r.date).not.toBeNull()
	})

	it('hele titel tussen aanhalingstekens: niets herkennen', () => {
		const r = parseTaskText('"Boodschappen halen donderdag"')
		expect(r.text).toBe('Boodschappen halen donderdag')
		expect(r.date).toBeNull()
	})

	it('findNlDate geeft de positie van de herkende tekst (voor het markeren)', () => {
		const tekst = 'Boodschappen halen voor volgende week donderdag'
		const m = findNlDate(tekst)
		expect(m).not.toBeNull()
		expect(tekst.slice(m!.index, m!.eind)).toBe('volgende week donderdag')
		expect(findNlDate('Boodschappen halen')).toBeNull()
		expect(findNlDate('Boodschappen halen ~donderdag')).toBeNull()
	})
})
