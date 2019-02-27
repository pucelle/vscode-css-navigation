export interface SimpleSelector {
	type: SimpleSelector.Type
	value: string
	raw: string
}

export namespace SimpleSelector {

	export enum Type{
		Tag,
		Class,
		Id
	}
	
	export function create(raw: string): SimpleSelector | null {
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
			raw
		}
	}

	export function validate(raw: string): boolean {
		return /^[#.]?\w[\w-]*$/i.test(raw)
	}
}
