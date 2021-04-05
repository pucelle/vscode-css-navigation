import {SimpleSelector} from '../common/simple-selector'
import {TextScanner} from '../common/text-scanner'
import * as path from 'path'
import {URI} from 'vscode-uri'
import * as fs from 'fs-extra'


/** 
 * JSXScanner scans things in a js, jsx, ts, tsx document.
 * It was used as a child service of HTMLScanner.
 */
export class JSXScanner extends TextScanner {

	/** Scan a JSX / JS / TS / TSX document from a specified offset to find a CSS selector. */
	async scanSelector(): Promise<SimpleSelector | null> {
		let inExpression = false

		let attributeValue = this.readLeftWord()
		let wordLeftOffset = this.offset + 1

		if (!attributeValue) {
			return null
		}
		
		
		// `.xxx`
		if (this.peekLeftChar() === '.') {
			this.readLeftChar()

			this.skipLeftWhiteSpaces()
			let attributeName = this.readLeftWord()

			// For Flit syntax `:class.property=...`
			if (attributeName === 'class') {
				let raw = '.' + attributeValue
				return SimpleSelector.create(raw, wordLeftOffset)
			}

			// Module CSS, e.g. `className={style.className}`.
			else {
				return this.scanCSSModule(attributeValue, wordLeftOffset)
			}
		}


		// Module CSS, e.g. `className={style['class-name']}`.
		if ((this.peekLeftChar() === '"' || this.peekLeftChar() === '\'') && this.peekLeftCharSkipWhiteSpaces(1) === '[') {
			this.readLeftUntil(['['])
			return this.scanCSSModule(attributeValue, wordLeftOffset)
		}

		this.readLeftUntil(['<', '\'', '"', '`', '{'])

		// Compare with `html-scanner`, here should ignore `<tagName>`.
		if (this.peekRightChar(1) === '<') {
			return null
		}


		// Skip expression left boundary `{`.
		this.skipLeftWhiteSpaces()
		if (this.peekLeftChar() !== '=') {

			// Assume it's in `className={...[HERE]...}` or `class="..."`
			this.readLeftUntil(['<', '{', '}'])
			if (this.peekRightChar(1) !== '{') {
				return null
			}

			// Flit syntax `:class=${{property: boolean}}`.
			if (this.peekLeftCharSkipWhiteSpaces() === '{' && this.peekLeftCharSkipWhiteSpaces(1) === '$') {
				this.readLeftUntil(['$'])
			}

			inExpression = true
		}


		// Read `=`.
		this.skipLeftWhiteSpaces()
		if (this.readLeftChar() !== '=') {
			return null
		}
		
		this.skipLeftWhiteSpaces()
		let attributeName = this.readLeftWord()

		if (attributeName === 'className' || attributeName === 'class' || attributeName === 'id' && !inExpression) {
			let raw = (attributeName === 'id' ? '#' : '.') + attributeValue
			return SimpleSelector.create(raw, wordLeftOffset)
		}

		return null
	}

	/** Scan imported CSS module. */
	private async scanCSSModule(attributeValue: string, wordLeftOffset: number): Promise<SimpleSelector | null> {
		let moduleVariable = this.readLeftWord()
		if (!moduleVariable) {
			return null
		}

		this.readLeftUntil(['{'])
		this.skipLeftWhiteSpaces()

		if (this.readLeftChar() !== '=') {
			return null
		}

		// Must be `className={style.className}`, or it will popup frequently even type `a.b`.
		this.skipLeftWhiteSpaces()
		let className = this.readLeftWord()
		if (className !== 'class' && className !== 'className') {
			return null
		}

		let modulePath = this.parseImportedPathFromVariableName(moduleVariable)
		if (modulePath) {
			let fullPath = path.resolve(path.dirname(URI.parse(this.document.uri).fsPath), modulePath)
			if (await fs.pathExists(fullPath)) {
				return SimpleSelector.create('.' + attributeValue, wordLeftOffset, URI.file(fullPath).toString())
			}
		}

		return SimpleSelector.create('.' + attributeValue, wordLeftOffset)
	}

	/** Parse `import ...`. */
	private parseImportedPathFromVariableName(nameToMatch: string): string | null {
		let re = /import\s+(\w+)\s+from\s+['"`](.+?)['"`]/g
		let match: RegExpExecArray | null

		while (match = re.exec(this.text)) {
			let name = match[1]
			if (name === nameToMatch) {
				return match[2]
			}
		}

		return null
	}

	/** Scan for relative import path. */
	scanForImportPath() {
		this.peekLeftChar

		// import * from '...'
		// import abc from '...'
		// import '...'
		let re = /import\s+(?:(?:\w+|\*)\s+from\s+)?['"`](.+?)['"`]/g
		let match: RegExpExecArray | null

		re.lastIndex = this.offset - 1024

		while (match = re.exec(this.text)) {
			// |'...'|, `|` marks location of start index and end index.
			let endIndex = re.lastIndex
			let startIndex = re.lastIndex - match[1].length - 2

			if (startIndex <= this.offset && endIndex > this.offset) {
				return match[1]
			}
		}

		return null
	}
}
