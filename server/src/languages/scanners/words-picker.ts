export interface PickedWord {
	text: string
	start: number
}


export namespace WordsPicker {

	/** "ab cd" => ["ab", "cd"]. */
	export function pickWords(text: string): PickedWord[] {
		let re = /[\w-]+/
		let match: RegExpExecArray | null
		let words: PickedWord[] = []

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
	export function pickWord(text: string, offset: number): PickedWord | undefined {
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
	export function pickWordsFromExpression(text: string): PickedWord[] {
		let re = /"(?:\\"|.)*?"|'(?:\\'|.)*?'|(\w+)\s*:/
		let match: RegExpExecArray | null
		let words: PickedWord[] = []

		while (match = re.exec(text)) {
			let start = match.index

			if (match[0] === '"' || match[0] === '\'') {
				for (let item of pickWords(match[0])) {
					words.push({
						start: start + item.start,
						text: item.text,
					})
				}
			}
			else {
				words.push({
					text: match[1],
					start,
				})
			}
		}

		return words
	}

	/** ["ab", {c|d: ef}] => "cd". */
	export function pickWordFromExpression(text: string, offset: number): PickedWord | undefined {
		for (let word of pickWordsFromExpression(text)) {
			let start = word.start
			let end = start + word.text.length

			if (start <= offset && end >= offset) {
				return word
			}
		}

		return undefined
	}
}