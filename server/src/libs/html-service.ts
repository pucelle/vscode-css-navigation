import {Position, TextDocument, Location, Range} from 'vscode-languageserver'
import {CSSSymbol} from './css-symbol'

export interface SimpleSelector {
	type: SimpleSelector.Type
	value: string
	raw: string
}

export namespace SimpleSelector {

	export enum Type{
		Tag,
		Class,
		Id
	}
	
	export function create(raw: string): SimpleSelector | null {
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
			raw
		}
	}

	export function validate(raw: string): boolean {
		return /^[#.]?\w[\w-]*\w$/i.test(raw)
	}

	export function getAtPosition(document: TextDocument, position: Position): SimpleSelector | null {
		let text = document.getText()
		let offset = document.offsetAt(position)
		
		return new SelectorScanner(text, offset).scan()
	}
}


/*
in fact there is an easier way to do so, only about 20 lines of code:
	1. get 1024 bytes in left
	2. match /.*(?:(?:class\s*=\s*")(?<class>[\s\w-]*)|(?:id\s*=\s*")(?<id>[\w-]*)|<(?<tag>[\w-]+))$/s
		.* - match any character in s flag, greedy mode, eat up all characters
		(?:
			(?:class\s*=\s*") - match class
			(?
				<class>
				[\s\w-]* - match multiple class name, can't use [\s\w-]*?[\w-]* to match, its already in greedy mode since above, another greedy expression will not work, here [\w-]* will match nothing
			)
			|
			(?:id\s*=\s*")(?<id>[\w-]*) - match id
			|
			<(?<tag>[\w-]+) - match tag
		)
		$
	3. for class, select /([\w-]+)$/
	4. read word in right, or slice 128 bytes in right, and match /^([\w-]+)/
	5. join left and right part
*/
class SelectorScanner {

	private text: string

	private position: number

	constructor(text: string, offset: number) {
		this.text = text
		this.position = offset - 1
	}

	private eos(): boolean {
		return this.position === -1
	}

	private read(): string {
		return this.text.charAt(this.position--)
	}

	private peek(): string {
		return this.text.charAt(this.position)
	}

	private back() {
		this.position++
	}

	private advance() {
		this.position--
	}

	private readWord(): string {
		let startPosition = this.position

		while (!this.eos()) {
			let char = this.read()
			if (!/[\w\-]/.test(char)) {
				this.back()
				break
			}
		}
		
		return this.text.slice(this.position + 1, startPosition + 1)
	}

	private readWholeWord(): string {
		let startPosition = this.position + 1

		while (startPosition < this.text.length) {
			let char = this.text[startPosition]
			if (/[\w\-]/.test(char)) {
				startPosition++
			}
			else {
				break
			}
		}

		this.readWord()
		
		return this.text.slice(this.position + 1, startPosition)
	}
	
	//include the until char
	private readUntil(chars: string[], maxCharCount: number = 1024): [string, string] {
		let startPosition = this.position
		let count = 0
		let untilChar = ''

		while (!this.eos() && count++ < maxCharCount) {
			let char = this.read()
			if (chars.indexOf(char) > -1) {
				untilChar = char
				break
			}
		}

		return [untilChar, this.text.slice(this.position + 1, startPosition + 1)]
	}

	private readWhiteSpaces() {
		while (!this.eos()) {
			let char = this.read()
			if (!/\s/.test(char)) {
				this.back()
				break
			}
		}
	}

	public scan(): SimpleSelector | null {
		let word = this.readWholeWord()
		let char = this.peek()

		if (char === '<') {
			return SimpleSelector.create(word)
		}

		let [untilChar, readChars] = this.readUntil(['<', '\'', '"'])
		if (!untilChar || untilChar === '<') {
			return null
		}

		/*
		may be in left:
			class="a
			id="a'
			class="a b
			class="a" b
		have a very low possibility to meet '<tag a="class=" b', ignore it
		*/
		if (this.peek() === '\\') {
			this.advance()
		}

		this.readWhiteSpaces()
		if (this.read() !== '=') {
			return null
		}

		this.readWhiteSpaces()
		let attribute = this.readWord().toLowerCase()

		if (attribute === 'class' || attribute === 'id') {
			let raw = (attribute === 'class' ? '.' : '#') + word
			return SimpleSelector.create(raw)
		}

		return null
	}
}


export function findDefinitionMatchSelectorInInnerStyle(document: TextDocument, select: SimpleSelector): Location[] {
	let text = document.getText()
	let re = /<style\b(.*?)>(.*?)<\/style>/gs
	let match: RegExpExecArray | null
	let locations: Location[] = []

	while (match = re.exec(text)) {
		let propertiesText = match[1] || ''
		let cssText = match[2]
		let propertiesMatch = propertiesText.match(/type\s*=\s*"text\/(scss|less|css)"/i)
		let languageId = propertiesMatch ? propertiesMatch[1].toLowerCase() : 'css'
		let styleIndex = re.lastIndex - 8 - cssText.length
		let cssDocument = TextDocument.create('untitled', languageId, 0, cssText)
		let cssLocations = CSSSymbol.create(cssDocument).findLocationsMatchSelector(select)

		for (let location of cssLocations) {
			let startIndexInCSS = cssDocument.offsetAt(location.range.start)
			let endIndexInCSS = cssDocument.offsetAt(location.range.end)
			let startIndexInHTML = startIndexInCSS + styleIndex
			let endIndexInHTML = endIndexInCSS + styleIndex

			locations.push(
				Location.create(document.uri, Range.create(
					document.positionAt(startIndexInHTML),
					document.positionAt(endIndexInHTML)
				))
			)
		}
	}

	return locations
}