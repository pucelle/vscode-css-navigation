import {SimpleSelector} from '../common/simple-selector'
import {ForwardScanner} from '../common/forward-scanner'
import * as path from 'path'
import {exists} from '../../libs/file'
import URI from 'vscode-uri'


export class JSXSimpleSelectorScanner extends ForwardScanner {

	async scan(): Promise<SimpleSelector | null> {
		let inExpression = false

		let attributeValue = this.readWholeWord()
		if (!attributeValue) {
			return null
		}
		
		// Module CSS, e.g. `className={style.className}`.
		if (this.peek() === '.') {
			this.read()
			return this.scanModuleCSS(attributeValue)
		}

		let [untilChar] = this.readUntil(['<', '\'', '"', '`'], 1024)

		// Compare to `html-scanner`, here should ignore `<tagName>`.
		if (!untilChar || untilChar === '<') {
			return null
		}

		this.skipWhiteSpaces()

		if (this.peek() !== '=') {
			// Assume it's in `className={...[HERE]...}` or `class="..."`
			[untilChar] = this.readUntil(['<', '{', '}'], 1024)
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

	private async scanModuleCSS(attributeValue: string): Promise<SimpleSelector | null> {
		let moduleVariable = this.readWord()
		if (!moduleVariable) {
			return null
		}

		let modulePath = this.getImportedPathFromVariableName(moduleVariable)
		if (modulePath) {
			let fullPath = path.resolve(path.dirname(URI.parse(this.document.uri).fsPath), modulePath)
			if (await exists(fullPath)) {
				return SimpleSelector.create('.' + attributeValue, fullPath)
			}
		}

		return SimpleSelector.create('.' + attributeValue)
	}

	private getImportedPathFromVariableName(nameToMatch: string): string | null {
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
