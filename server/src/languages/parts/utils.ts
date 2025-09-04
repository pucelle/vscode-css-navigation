/** Escape like `.xl\:w` -> `.xl:w`. */
export function escapedCSSSelector(text: string) {
	if (text.includes('\\')) {
		text = text.replace(/\\(.)/g, '$1')
	}

	return text
}

