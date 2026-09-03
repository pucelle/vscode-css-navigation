import {Part, PartType} from './part'


const BooleanContextualAttributes = new Set(['disabled', 'checked', 'selected', 'hidden'])


/** An attribute reference whose normalized comparison text differs from its source range. */
export class AttributeSelectorReferencePart extends Part {
	private readonly sourceEnd: number

	constructor(type: PartType.Attribute | PartType.CSSSelectorQueryAttribute, text: string, start: number, end: number) {
		super(type, text, start, end)
		this.sourceEnd = end
	}

	override get end() {
		return this.sourceEnd
	}
}


/** Whether an HTML attribute is supported as an attribute selector. */
export function isSelectableAttributeName(name: string): boolean {
	name = name.toLowerCase()

	return BooleanContextualAttributes.has(name)
		|| name === 'type'
		|| name.startsWith('aria-')
		|| name.startsWith('data-')
}


/** Build a normalized selector from a known HTML attribute. */
export function makeAttributeSelector(name: string, value?: string): string {
	name = name.toLowerCase()
	if (BooleanContextualAttributes.has(name) || value === undefined) {
		return `[${name}]`
	}

	return `[${name}=${value}]`
}


/** Normalize an exact CSS attribute selector for comparison with HTML attributes. */
export function normalizeAttributeSelector(text: string): string | null {
	let inner = text.trim()
	if (inner.startsWith('[') && inner.endsWith(']')) {
		inner = inner.slice(1, -1).trim()
	}

	let match = /^([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?$/.exec(inner)
	if (!match) {
		return null
	}

	let name = match[1].toLowerCase()
	let value = match[2] ?? match[3] ?? match[4]
	return value === undefined ? `[${name}]` : `[${name}=${value}]`
}
