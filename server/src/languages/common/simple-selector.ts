export interface SimpleSelector {

	/** Selector type. */
	type: SimpleSelector.Type

	/** Raw selector string. */
	raw: string

	/** `.`, `#`, or empty string. */
	identifier: string

	/** Selector string exclude identifier. */
	label: string

	/** Position of left offset. */
	startIndex: number

	/** Related imported file, only available for JSX files. */
	importURI: string | null
}

export namespace SimpleSelector {

	/** Selector types. */
	export enum Type{
		Tag,
		Class,
		Id
	}
	
	/** Create a selector from raw selector string. */
	export function create(raw: string, startOffset: number = 0, importURI: string | null = null): SimpleSelector | null {
		if (!validate(raw)) {
			return null
		}

		let type = raw[0] === '.' ? Type.Class
			: raw[0] === '#' ? Type.Id
			: Type.Tag

		let label = getLabel(raw, type)

		return {
			type,
			raw,
			identifier: type === Type.Tag ? '' : raw[0],
			label,
			startIndex: startOffset,
			importURI,
		}
	}

	/** Removes `.` and `#` at start position. */
	function getLabel(raw: string, type: Type): string {
		let label = type === Type.Tag ? raw : raw.slice(1)
		return label
	}

	/** Whether a stirng is a valid selector. */
	export function validate(raw: string): boolean {
		return /^[#.]?\w[\w-]*$/i.test(raw)
	}

	/** Whether a tag, but not custom tag. */
	export function isNonCustomTag(selector: SimpleSelector): boolean {
		return selector.type === Type.Tag && !selector.label.includes('-')
	}

	/** Whether a custom tag. */
	export function isCustomTag(selector: SimpleSelector): boolean {
		return selector.type === Type.Tag && selector.label.includes('-')
	}
}
