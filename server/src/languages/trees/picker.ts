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