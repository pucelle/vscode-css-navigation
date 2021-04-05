export interface SimpleSelector {

	/** Selector type. */
	type: SimpleSelector.Type

	/** Selector string. */
	value: string

	/** Raw selector string. */
	raw: string

	/** Position of left offset. */
	leftOffset: number

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
	export function create(raw: string, leftOffset: number, importURI: string | null = null): SimpleSelector | null {
		if (!validate(raw)) {
			return null
		}

		let type = raw[0] === '.' ? Type.Class
			: raw[0] === '#' ? Type.Id
			: Type.Tag

		let value = type === Type.Tag ? raw : raw.slice(1)

		return {
			type,
			value,
			raw,
			leftOffset,
			importURI,
		}
	}

	export function validate(raw: string): boolean {
		return /^[#.]?\w[\w-]*$/i.test(raw)
	}
}
