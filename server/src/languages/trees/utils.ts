/** `"ab"` => `ab`. */
export function removeQuotes(text: string): string {
	if (/^['"]/.test(text)) {
		text = text.slice(1)
	}

	if (/['"]$/.test(text)) {
		text = text.slice(-1)
	}

	return text
}


/** Returns whether has been quoted. */
export function hasQuotes(text: string): boolean {
	return /^['"]/.test(text) && /['"]$/.test(text)
}


/** Returns whether has expression. */
export function mayBeExpression(text: string): boolean {
	return !hasQuotes(text) && text.includes('{')
}
