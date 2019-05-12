export interface SimpleSelector {
	type: SimpleSelector.Type
	value: string
	raw: string
	filePath: string | null
}

export namespace SimpleSelector {

	export enum Type{
		Tag,
		Class,
		Id
	}
	
	export function create(raw: string, filePath: string | null = null): SimpleSelector | null {
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
			filePath
		}
	}

	export function validate(raw: string): boolean {
		return /^[#.]?\w[\w-]*$/i.test(raw)
	}
}
