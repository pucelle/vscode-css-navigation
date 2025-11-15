import {AnyToken} from '../scanners'


/** Remove quotes from token. */
export function removeQuotesFromToken<T extends number>(token: AnyToken<T>): AnyToken<T> {
	let text = token.text

	if (hasQuotes(text)) {
		text = text.slice(1, -1)

		return {
			type: token.type,
			text,
			start: token.start + 1,
			end: token.end - 1,
		}
	}
	else {
		return token
	}
}


/** `"ab"` => `ab`. */
export function removeQuotes(text: string): string {
	if (/^['"]/.test(text)) {
		text = text.slice(1)
	}

	if (/['"]$/.test(text)) {
		text = text.slice(0, -1)
	}

	return text
}


/** Returns whether has been quoted. */
export function hasQuotes(text: string): boolean {
	return /^['"]/.test(text) && /['"]$/.test(text)
}


/** Returns whether like expression, which means `^{...}$` or `^\${...}$`. */
export function beExpression(text: string): boolean {
	return /^\$?\{.*?\}$/.test(text)
}


/** Join several tokens to one. */
export function joinTokens<T extends AnyToken<any>>(tokens: T[], string: string, tokenOffset: number): T {
	if (tokens.length === 1) {
		return tokens[0]
	}
	else {
		let type = tokens[0].type
		let start = tokens[0].start
		let end = tokens[tokens.length - 1].end
		let text = string.slice(start - tokenOffset, end - tokenOffset)

		return {
			type,
			text,
			start,
			end,
		} as T
	}
}


/** Escape as regexp source text.`\.` -> `\\.` */
export function escapeAsRegExpSource(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

