/** Get first sub match. */
export function firstMatch(string: string, re: RegExp) {
	let m = string.match(re)
	if (!m) {
		return null
	}

	return m[1]
}
