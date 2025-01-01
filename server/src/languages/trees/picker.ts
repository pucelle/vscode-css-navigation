export interface Picked {
	text: string
	start: number
}


export namespace Picker {

	/** "ab cd" => ["ab", "cd"]. */
	export function pickWords(text: string): Picked[] {
		let re = /[\w-]+/g
		let match: RegExpExecArray | null
		let words: Picked[] = []

		while (match = re.exec(text)) {
			let start = match.index

			words.push({
				text: match[0],
				start,
			})
		}

		return words
	}

	/** "ab c|d" => "cd". */
	export function pickWord(text: string, offset: number): Picked | undefined {
		for (let word of pickWords(text)) {
			let start = word.start
			let end = start + word.text.length

			if (start <= offset && end >= offset) {
				return word
			}
		}

		return undefined
	}


	/** ["ab", {cd: ef}] => ["ab", "cd"]. */
	export function pickWordsFromExpression(text: string): Picked[] {
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
				for (let item of pickWords(match[0])) {
					words.push({
						start: start + item.start,
						text: item.text,
					})
				}
			}
		}

		return words
	}

	/** ["ab", {c|d: ef}] => "cd". */
	export function pickWordFromExpression(text: string, offset: number): Picked | undefined {
		for (let word of pickWordsFromExpression(text)) {
			let start = word.start
			let end = start + word.text.length

			if (start <= offset && end >= offset) {
				return word
			}
		}

		return undefined
	}


	/** 
	 * Add start offset to each match item.
	 * Note it may not 100% get correct result.
	 * `re` must not be global.
	 */
	function addOffsetToMatch(match: RegExpMatchArray | RegExpExecArray): Picked[] {
		let o: Picked[] = []
		let lastIndex = 0

		for (let i = 0; i < match.length; i++) {
			let m = match[i]
			let start = i === 0 ? 0 : match[0].indexOf(m, lastIndex)

			o.push({
				text: m,
				start: match.index! + start,
			})

			if (i > 0) {
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
			let start = match[0].indexOf(m, lastIndex)

			o[k] = {
				text: m,
				start: match.index! + start,
			}

			lastIndex = start + m.length
		}

		return o
	}

	/** 
	 * Match string, add start offset to each match.
	 * Note it may not 100% get correct result.
	 * `re` must not be global.
	 */
	export function locateMatches(text: string, re: RegExp): Picked[] | null {
		let match = text.match(re)
		if (!match) {
			return null
		}

		return addOffsetToMatch(match)
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
	 * Match string, add start offset to each match.
	 * Note it may not 100% get correct result.
	 * `re` must be global.
	 */
	export function* locateAllMatches(text: string, re: RegExp): Iterable<Picked[]> {
		let match: RegExpExecArray | null

		while (match = re.exec(text)) {
			yield addOffsetToMatch(match)
		}
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
}