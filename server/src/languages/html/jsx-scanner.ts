import {SimpleSelector} from '../common/simple-selector'
import {ForwardScanner} from '../common/forward-scanner'
import * as path from 'path'
import {URI} from 'vscode-uri'
import * as fs from 'fs-extra'


export class JSXSimpleSelectorScanner extends ForwardScanner {

	/** Scan a JSX document from a specified offset to find a CSS selector. */
	async scan(): Promise<SimpleSelector | null> {
		let inExpression = false

		let attributeValue = this.readWholeWord()
		if (!attributeValue) {
			return null
		}
		
		// Module CSS, e.g. `className={style.className}`.
		if (this.peek() === '.') {
			this.read()
			return this.scanCSSModule(attributeValue)
		}

		// Module CSS, e.g. `className={style['class-name']}`.
		if ((this.peek() === '"' || this.peek() === '\'') && this.peekSkipWhiteSpaces(1) === '[') {
			this.readUntil(['['])
			return this.scanCSSModule(attributeValue)
		}

		let [untilChar] = this.readUntil(['<', '\'', '"', '`'])

		// Compare to `html-scanner`, here should ignore `<tagName>`.
		if (!untilChar || untilChar === '<') {
			return null
		}

		this.skipWhiteSpaces()

		if (this.peek() !== '=') {
			// Assume it's in `className={...[HERE]...}` or `class="..."`
			[untilChar] = this.readUntil(['<', '{', '}'])
			if (!untilChar || untilChar !== '{') {
				return null
			}

			inExpression = true
		}

		this.skipWhiteSpaces()
		if (this.read() !== '=') {
			return null
		}
		
		this.skipWhiteSpaces()
		let attributeName = this.readWord()

		if (attributeName === 'className' || attributeName === 'class' || attributeName === 'id' && !inExpression) {
			let raw = (attributeName === 'id' ? '#' : '.') + attributeValue
			return SimpleSelector.create(raw)
		}

		return null
	}

	/** Scan imported CSS module. */
	private async scanCSSModule(attributeValue: string): Promise<SimpleSelector | null> {
		let moduleVariable = this.readWord()
		if (!moduleVariable) {
			return null
		}

		this.readUntil(['{'])
		this.skipWhiteSpaces()
		if (this.read() !== '=') {
			return null
		}

		// Must be `className={style.className}`, or it will popup frequently even type `a.b`.
		this.skipWhiteSpaces()
		let className = this.readWord()
		if (className !== 'class' && className !== 'className') {
			return null
		}

		let modulePath = this.parseImportedPathFromVariableName(moduleVariable)
		if (modulePath) {
			let fullPath = path.resolve(path.dirname(URI.parse(this.document.uri).fsPath), modulePath)
			if (await fs.pathExists(fullPath)) {
				return SimpleSelector.create('.' + attributeValue, fullPath)
			}
		}

		return SimpleSelector.create('.' + attributeValue)
	}

	/** Parse `import ...`. */
	private parseImportedPathFromVariableName(nameToMatch: string): string | null {
		let re = /import\s+(\w+)\s+from\s+(['"])(.+?)\2/g
		let match: RegExpExecArray | null

		while (match = re.exec(this.text)) {
			let name = match[1]
			if (name === nameToMatch) {
				return match[3]
			}
		}

		return null
	}
}
