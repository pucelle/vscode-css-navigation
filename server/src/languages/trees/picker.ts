export interface Picked {
	text: string
	start: number
}


export namespace Picker {

	/** 
	 * Match string, add start offset to each match.
	 * Note it may not 100% get correct result.
	 * Note it will skip not captured matches, means `/(1)|(2)/` will always fill match[1].
	 * `re` must not be global.
	 */
	export function locateMatches<I extends number>(text: string, re: RegExp, matchIndices: I[]): Record<I, Picked> | null {
		const match = text.match(re)
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

		while ((match = re.exec(text)) !== null) {
			yield addOffsetToMatches(match, matchIndices)
		}
	}

	/** 
	 * Match string to get match groups, add start offset to each grouped match.
	 * Note it may not 100% get correct result.
	 * `re` must not be global.
	 */
	export function locateMatchGroups(text: string, re: RegExp): Record<string, Picked> | null {
		const match = text.match(re)
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

		while ((match = re.exec(text)) !== null) {
			yield addOffsetToMatchGroup(match)
		}
	}

	/** 
	 * Add start offset to each match item.
	 * Note it may not 100% get correct result.
	 */
	function addOffsetToMatches(match: RegExpMatchArray | RegExpExecArray, matchIndices: number[]): Record<number, Picked> {
		const o: Record<number, Picked> = {}
		let lastIndex = 0

		for (const matchIndex of matchIndices) {
			const m = match[matchIndex]
			if (!m) {
				continue
			}
			
			const start = matchIndex === 0 ? 0 : match[0].indexOf(m, lastIndex)

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
		const o: Record<string, Picked> = {}

		const groups = match.groups
		if (!groups) {
			return o
		}

		let lastIndex = 0

		for (const [k, m] of Object.entries(groups)) {
			if (!m) {
				continue
			}
			
			const start = match[0].indexOf(m, lastIndex)

			o[k] = {
				text: m,
				start: match.index! + start,
			}

			lastIndex = start + m.length
		}

		return o
	}
}