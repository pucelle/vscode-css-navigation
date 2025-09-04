export interface Picked {
	text: string
	start: number
}


export namespace Picker {

	/** 
	 * "ab cd" => ["ab", "cd"].
	 * Starts with `a-z` or `_`, but can follow any non-whitespace characters.
	 */
	export function pickClassNames(text: string): Picked[] {
		let re = /\w[^\s"'`]*/g
		let match: RegExpExecArray | null
		let words: Picked[] = []

		while (match = re.exec(text)) {

			// Have interpolation characters.
			if (/\$\{/.test(match[0])) {
				continue
			}

			let start = match.index

			words.push({
				text: match[0],
				start,
			})
		}

		return words
	}


	/** 
	 * ["ab", {cd: ef}] => ["ab", "cd"].
	 * Starts with `a-z` or `_`, but can follow any non-whitespace characters.
	 */
	export function pickClassNamesFromExpression(text: string): Picked[] {
		let re = /"(?:\\"|.)*?"|'(?:\\'|.)*?'|`(?:\\`|.)*?`|(\w+)\s*:/g
		let match: RegExpExecArray | null
		let words: Picked[] = []

		while (match = re.exec(text)) {
			let start = match.index

			if (match[1]) {
				words.push({
					text: match[1],
					start,
				})
			}
			else {
				for (let item of pickClassNames(match[0])) {
					words.push({
						start: start + item.start,
						text: item.text,
					})
				}
			}
		}

		return words
	}


	/** 
	 * `"|"` -> `[""]`.
	 * `"a |"` -> `[""]`.
	 * `"a | b"` -> `[""]`.
	 */
	export function pickPotentialEmptyWords(text: string): Picked[] {
		let re = /"(?:\\"|.)*?"|'(?:\\'|.)*?'|`(?:\\`|.)*?`/g
		let match: RegExpExecArray | null
		let words: Picked[] = []

		while (match = re.exec(text)) {
			let start = match.index + 1
			let quoted = match[0].slice(1, -1)

			// `"|"` -> `[""]`.
			if (quoted.length === 0) {
				words.push({
					text: '',
					start,
				})
			}
			else {
				let sm: RegExpExecArray | null
				let re = /\s+/g

				while (sm = re.exec(quoted)) {
					let subStart = sm.index
					let subEnd = sm.index + sm[0].length

					// `| a`
					if (subStart === 0) {
						subEnd--
					}

					// `a |`
					else if (subEnd === quoted.length) {
						subStart++
					}

					// `a  b`
					else {
						subStart++
						subEnd--
					}

					// `a b`
					if (subStart > subEnd) {
						continue
					}

					words.push({
						text: quoted.slice(subStart, subEnd),
						start: start + subStart,
					})
				}
			}
		}

		return words
	}


	/** 
	 * Match string, add start offset to each match.
	 * Note it may not 100% get correct result.
	 * Note it will skip not captured matches, means `/(1)|(2)/` will always fill match[1].
	 * `re` must not be global.
	 */
	export function locateMatches<I extends number>(text: string, re: RegExp, matchIndices: I[]): Record<I, Picked> | null {
		let match = text.match(re)
		if (!match) {
			return null
		}

		return addOffsetToMatches(match, matchIndices)
	}

	/** 
	 * Match string, add start offset to each match.
	 * Note it may not 100% get correct result.
	 * Note it will skip not captured matches, means `/(1)|(2)/` will always fill match[1].
	 * Beware, captured group must capture at least one character.
	 * `re` must be global.
	 */
	export function* locateAllMatches<I extends number>(text: string, re: RegExp, matchIndices: I[]): Iterable<Record<I, Picked>> {
		let match: RegExpExecArray | null

		while (match = re.exec(text)) {
			yield addOffsetToMatches(match, matchIndices)
		}
	}

	/** 
	 * Match string to get match groups, add start offset to each grouped match.
	 * Note it may not 100% get correct result.
	 * `re` must not be global.
	 */
	export function locateMatchGroups(text: string, re: RegExp): Record<string, Picked> | null {
		let match = text.match(re)
		if (!match) {
			return null
		}

		return addOffsetToMatchGroup(match)
	}

	/** 
	 * Match string to get match groups, add start offset to each grouped match.
	 * Note it may not 100% get correct result.
	 * `re` must be global.
	 */
	export function* locateAllMatchGroups(text: string, re: RegExp): Iterable<Record<string, Picked>> {
		let match: RegExpExecArray | null

		while (match = re.exec(text)) {
			yield addOffsetToMatchGroup(match)
		}
	}

	/** 
	 * Add start offset to each match item.
	 * Note it may not 100% get correct result.
	 */
	function addOffsetToMatches(match: RegExpMatchArray | RegExpExecArray, matchIndices: number[]): Record<number, Picked> {
		let o: Record<number, Picked> = {}
		let lastIndex = 0

		for (let matchIndex of matchIndices) {
			let m = match[matchIndex]
			if (!m) {
				continue
			}
			
			let start = matchIndex === 0 ? 0 : match[0].indexOf(m, lastIndex)

			o[matchIndex] = {
				text: m,
				start: match.index! + start,
			}

			if (matchIndex > 0) {
				lastIndex = start + m.length
			}
		}

		return o
	}

	/** 
	 * Add start offset to each grouped match item.
	 * Note it may not 100% get correct result.
	 * `re` must not be global.
	 */
	function addOffsetToMatchGroup(match: RegExpMatchArray | RegExpExecArray): Record<string, Picked> {
		let o: Record<string, Picked> = {}

		let groups = match.groups
		if (!groups) {
			return o
		}

		let lastIndex = 0

		for (let [k, m] of Object.entries(groups)) {
			if (!m) {
				continue
			}
			
			let start = match[0].indexOf(m, lastIndex)

			o[k] = {
				text: m,
				start: match.index! + start,
			}

			lastIndex = start + m.length
		}

		return o
	}
}