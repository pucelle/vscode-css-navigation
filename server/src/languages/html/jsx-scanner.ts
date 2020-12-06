import {SimpleSelector} from '../common/simple-selector'
import {TextScanner} from '../common/text-scanner'
import * as path from 'path'
import {URI} from 'vscode-uri'
import * as fs from 'fs-extra'


export class JSXScanner extends TextScanner {

	/** Scan a JSX document from a specified offset to find a CSS selector. */
	async scanSelector(): Promise<SimpleSelector | null> {
		let inExpression = false

		let attributeValue = this.readLeftWord()
		if (!attributeValue) {
			return null
		}
		
		// Module CSS, e.g. `className={style.className}`.
		if (this.peekLeft() === '.') {
			this.readLeft()
			return this.scanCSSModule(attributeValue)
		}

		// Module CSS, e.g. `className={style['class-name']}`.
		if ((this.peekLeft() === '"' || this.peekLeft() === '\'') && this.peekLeftSkipWhiteSpaces(1) === '[') {
			this.readLeftUntil(['['])
			return this.scanCSSModule(attributeValue)
		}

		this.readLeftUntil(['<', '\'', '"', '`'])

		// Compare to `html-scanner`, here should ignore `<tagName>`.
		if (this.peekRight(1) === '<') {
			return null
		}

		this.skipLeftWhiteSpaces()

		if (this.peekLeft() !== '=') {
			// Assume it's in `className={...[HERE]...}` or `class="..."`
			this.readLeftUntil(['<', '{', '}'])
			if (this.peekRight(1) !== '{') {
				return null
			}

			inExpression = true
		}

		this.skipLeftWhiteSpaces()
		if (this.readLeft() !== '=') {
			return null
		}
		
		this.skipLeftWhiteSpaces()
		let attributeName = this.readLeftWord()

		if (attributeName === 'className' || attributeName === 'class' || attributeName === 'id' && !inExpression) {
			let raw = (attributeName === 'id' ? '#' : '.') + attributeValue
			return SimpleSelector.create(raw)
		}

		return null
	}

	/** Scan imported CSS module. */
	private async scanCSSModule(attributeValue: string): Promise<SimpleSelector | null> {
		let moduleVariable = this.readLeftWord()
		if (!moduleVariable) {
			return null
		}

		this.readLeftUntil(['{'])
		this.skipLeftWhiteSpaces()

		if (this.readLeft() !== '=') {
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
				return SimpleSelector.create('.' + attributeValue, URI.file(fullPath).toString())
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
