// Typering bij nlDatum.generated.js (gegenereerd uit src/parse.js van vikunja-nl-datum).

export const ESCAPE_TEKEN: string

export interface ParseOpties {
	defaultTime?: string,
}

export function parseTitle(
	titel: string,
	now?: Date,
	opties?: ParseOpties,
): {title: string, due: Date | null} | null

export function markeerDatum(
	titel: string,
	now?: Date,
	opties?: ParseOpties,
): {index: number, eind: number, due: Date} | null
