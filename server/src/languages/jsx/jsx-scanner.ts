import {SimpleSelector} from '../common/simple-selector'
import {TextScanner} from '../common/text-scanner'
import * as path from 'path'
import {URI} from 'vscode-uri'
import {getPathExtension, resolveImportPath} from '../../helpers/file'


/** 
 * JSXScanner scans things in a js, jsx, ts, tsx document.
 * It was used as a child service of HTMLScanner.
 */
export class JSXScanner extends TextScanner {

	private supportedLanguages = ['css', 'less', 'scss']

	/** Scan a JSX / JS / TS / TSX document from a specified offset to find a CSS selector. */
	async scanSelector(): Promise<SimpleSelector | null> {
		// <tag
		// 	 id="a'
		// 	 class="a"
		// 	 class="a b"
		// >
		let match = this.match(
			/<\w+\s*(.*?)>/g,
			/\b(?<type>id|class|className)\s*=\s*['"`](.*?)['"`]/g,
			/([\w-]+)/g,
		)

		if (match) {
			if (match.groups.type === 'id') {
				return SimpleSelector.create('#' + match.text, match.index)
			}
			else if (match.groups.type === 'class' || match.groups.type === 'className') {
				return SimpleSelector.create('.' + match.text, match.index)
			}
		}


		// Syntax `:class.property=...`
		match = this.match(/\bclass\.([\w-]+)/g)
		if (match) {
			return SimpleSelector.create('.' + match.text, match.index)
		}


		// Syntax: `:class=${{property: boolean}}`.
		match = this.match(
			/\bclass\s*=\s*\$\{\s*\{(.*?)\}\s*\}/g,
			/(\w+)\s*:/g,
		)
		if (match) {
			return SimpleSelector.create('.' + match.text, match.index)
		}


		// React syntax:
		// `class={['...']}, '...' part
		// `class={'...'}
		match = this.match(
			/\b(?:class|className)\s*=\s*\{((?:\{[\s\S]*?\}|.)*?)\}/g,
			/['"`](.*?)['"`]/g,
			/([\w-]+)/g,
		)
		if (match) {
			return SimpleSelector.create('.' + match.text, match.index)
		}


		// React syntax:
		// `class={[..., {...}]}, {...} part.
		match = this.match(
			/\b(?:class|className)\s*=\s*\{((?:\{[\s\S]*?\}|.)*?)\}/g,
			/\{(.*?)\}/g,
			/(\w+)\s*:/g,
		)
		if (match) {
			return SimpleSelector.create('.' + match.text, match.index)
		}


		// Due to https://github.com/gajus/babel-plugin-react-css-modules and issue #60.
		// `styleName='...'.
		match = this.match(
			/\bstyleName\s*=\s*['"`](.*?)['"`]/g,
			/([\w-]+)/g,
		)
		if (match) {
			return this.scanDefaultCSSModule(match.text, match.index)
		}


		// React Module CSS, e.g.
		// `class={style.className}`.
		// `class={style['class-name']}`.
		match = this.match(
			/\b(?:class|className)\s*=\s*\{(.*?)\}/g,
			/(?<moduleName>\w+)(?:\.(\w+)|\[\s*['"`](\w+)['"`]\s*\])/,
		)
		if (match) {
			return this.scanCSSModule(match.groups.moduelName, match.text, match.index)
		}


		// jQuery selector, e.g.
		// `$('.abc')`
		match = this.match(
			/\$\((.*?)\)/g,
			/['"`](.*?)['"`]/g,
			/(?<identifier>^|\s|.|#)([\w-]+)/g,
		)
		if (match) {
			if (match.groups.identifier === '#' || match.groups.identifier === '.') {
				return SimpleSelector.create(match.groups.identifier + match.text, match.index)
			}
			else {
				return SimpleSelector.create(match.text, match.index)
			}
		}


		return null
	}

	/** Scan imported CSS module. */
	private async scanCSSModule(moduleName: string, moduleProperty: string, wordLeftOffset: number): Promise<SimpleSelector | null> {
		let modulePath = this.parseImportedPathFromVariableName(moduleName)
		if (modulePath) {
			let fullPath = await resolveImportPath(path.dirname(URI.parse(this.document.uri).fsPath), modulePath)
			if (fullPath) {
				return SimpleSelector.create('.' + moduleProperty, wordLeftOffset, URI.file(fullPath).toString())
			}
		}

		return SimpleSelector.create('.' + moduleProperty, wordLeftOffset)
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

	/** Scan imported CSS module. */
	private async scanDefaultCSSModule(moduleProperty: string, wordLeftOffset: number): Promise<SimpleSelector | null> {
		let modulePath = this.parseDefaultImportedPath()
		if (modulePath) {
			let fullPath = await resolveImportPath(path.dirname(URI.parse(this.document.uri).fsPath), modulePath)
			if (fullPath) {
				return SimpleSelector.create('.' + moduleProperty, wordLeftOffset, URI.file(fullPath).toString())
			}
		}

		return SimpleSelector.create('.' + moduleProperty, wordLeftOffset)
	}

	/** Parse `import '....css'`. */
	private parseDefaultImportedPath(): string | null {
		let re = /import\s+['"`](.+?)['"`]/g
		let match: RegExpExecArray | null

		while (match = re.exec(this.text)) {
			let path = match[1]
			let extension = getPathExtension(path)
			if (this.supportedLanguages.includes(extension)) {
				return path
			}
		}

		return null
	}

	/** Scan for relative import path. */
	async scanForImportPath() {

		// import * from '...'
		// import abc from '...'
		// import '...'

		let modulePath = this.match(/import\s+(?:(?:\w+|\*)\s+from\s+)?['"`](.+?)['"`]/g)?.text || null
		if (modulePath) {
			return await resolveImportPath(path.dirname(URI.parse(this.document.uri).fsPath), modulePath)
		}

		return null
	}
}
