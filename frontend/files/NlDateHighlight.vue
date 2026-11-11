<template>
	<!--
		De markering ligt als doorzichtige laag over het invoerveld: dezelfde tekst, maar onzichtbaar,
		met alleen een gekleurde achtergrond achter de herkende datum. Het invoerveld zelf blijft ongewijzigd.
	-->
	<Teleport
		v-if="host"
		:to="host"
	>
		<div
			ref="backdropEl"
			class="nl-date-backdrop"
			aria-hidden="true"
			:style="backdropStyle"
		><span
			v-for="(part, i) in analysis.parts"
			:key="i"
			:class="{'nl-date-mark': part.start !== null}"
			:data-start="part.start ?? undefined"
		>{{ part.text }}</span></div>
	</Teleport>
	<p
		v-if="analysis.hints.length > 0"
		class="nl-date-hint"
	>
		📅 {{ analysis.hints.join(' · ') }}
		<span class="nl-date-hint-help">
			Klik op de gemarkeerde tekst om dat niet als datum te gebruiken.
		</span>
	</p>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue'
import {useResizeObserver} from '@vueuse/core'

import {findNlDate} from '@/modules/quickAddMagic/nlDatum'

const props = defineProps<{
	textarea: HTMLTextAreaElement | null | undefined,
	text: string,
}>()

interface Part {
	text: string,
	// Plek in het invoerveld waar de gemarkeerde tekst begint; null = gewone tekst.
	start: number | null,
}

// Deze eigenschappen nemen we over van het invoerveld, zodat de laag de tekst precies zo afbreekt.
const MIRROR_PROPS = [
	'boxSizing',
	'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
	'lineHeight', 'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent', 'textAlign', 'direction',
	'tabSize', 'whiteSpace', 'overflowWrap', 'wordBreak',
	'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
	'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
] as const

const dateFormat = new Intl.DateTimeFormat('nl-NL', {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit',
})

const host = ref<HTMLElement | null>(null)
const backdropEl = ref<HTMLElement | null>(null)
const backdropStyle = ref<Record<string, string>>({})

// Elke regel wordt een eigen taak, dus elke regel krijgt zijn eigen herkenning.
const analysis = computed(() => {
	const parts: Part[] = []
	const hints: string[] = []
	const push = (text: string, start: number | null) => {
		if (text !== '') {
			parts.push({text, start})
		}
	}

	const lines = props.text.split('\n')
	let offset = 0
	lines.forEach((line, index) => {
		const lead = line.length - line.trimStart().length
		const found = findNlDate(line.slice(lead))
		if (found === null) {
			push(line, null)
		} else {
			push(line.slice(0, lead + found.index), null)
			push(line.slice(lead + found.index, lead + found.eind), offset + lead + found.index)
			push(line.slice(lead + found.eind), null)
			hints.push(dateFormat.format(found.due))
		}
		if (index < lines.length - 1) {
			push('\n', null)
		}
		offset += line.length + 1
	})

	return {parts, hints}
})

function measure() {
	const textarea = props.textarea
	if (!textarea) {
		return
	}
	host.value = textarea.offsetParent as HTMLElement | null

	const computedStyle = getComputedStyle(textarea)
	const style: Record<string, string> = {
		position: 'absolute',
		top: `${textarea.offsetTop}px`,
		left: `${textarea.offsetLeft}px`,
		width: `${textarea.offsetWidth}px`,
		height: `${textarea.offsetHeight}px`,
		margin: '0',
		overflow: 'hidden',
		pointerEvents: 'none',
		color: 'transparent',
		borderStyle: 'solid',
		borderColor: 'transparent',
	}
	for (const prop of MIRROR_PROPS) {
		style[prop] = computedStyle[prop]
	}
	backdropStyle.value = style
}

useResizeObserver(() => props.textarea, measure)

// Bij een klik of muisbeweging: ligt de muis op een gemarkeerd stuk? Dan geeft dit de beginplek terug.
function markAt(x: number, y: number): number | null {
	if (!backdropEl.value) {
		return null
	}
	for (const element of backdropEl.value.querySelectorAll<HTMLElement>('.nl-date-mark')) {
		for (const rect of element.getClientRects()) {
			if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
				return Number(element.dataset.start)
			}
		}
	}
	return null
}

function onClick(event: MouseEvent) {
	const textarea = props.textarea
	// Tekst aan het selecteren? Dan is dit geen klik op de markering.
	if (!textarea || textarea.selectionStart !== textarea.selectionEnd) {
		return
	}
	const start = markAt(event.clientX, event.clientY)
	if (start === null) {
		return
	}
	// Een ~ vlak voor de tekst betekent: dit is geen datum. De ~ verdwijnt bij het opslaan uit de titel.
	textarea.setRangeText('~', start, start, 'preserve')
	textarea.dispatchEvent(new Event('input', {bubbles: true}))
}

function onMove(event: MouseEvent) {
	if (props.textarea) {
		props.textarea.style.cursor = markAt(event.clientX, event.clientY) === null ? '' : 'pointer'
	}
}

watch(() => props.textarea, (textarea, _old, onCleanup) => {
	if (!textarea) {
		return
	}
	textarea.addEventListener('click', onClick)
	textarea.addEventListener('mousemove', onMove)
	measure()
	onCleanup(() => {
		textarea.removeEventListener('click', onClick)
		textarea.removeEventListener('mousemove', onMove)
		textarea.style.cursor = ''
	})
}, {immediate: true, flush: 'post'})
</script>

<style scoped>
.nl-date-backdrop {
	z-index: 1;
	user-select: none;
}

.nl-date-mark {
	background: color-mix(in srgb, var(--primary, #1973ff) 24%, transparent);
	border-radius: 3px;
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary, #1973ff) 40%, transparent);
}

.nl-date-hint {
	margin: .25rem 0 0;
	padding-inline: 2.5rem;
	font-size: .85rem;
}

.nl-date-hint-help {
	margin-inline-start: .5rem;
	opacity: .6;
}
</style>
