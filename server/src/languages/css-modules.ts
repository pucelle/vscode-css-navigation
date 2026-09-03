import {isCSSLikePath} from '../utils'
import {Part, PartType} from './parts'
import {escapeAsRegExpSource} from './trees/utils'


export interface CSSModuleImport {
	name: string
	path: string
	pathStart: number
}


/** Find default, namespace, and CommonJS CSS Module imports. */
export function findCSSModuleImports(text: string): CSSModuleImport[] {
	let imports: CSSModuleImport[] = []

	let patterns = [
		/import\s+(?:\*\s+as\s+)?([\w$]+)\s+from\s+['"`](.+?)['"`]/g,
		/(?:const|let|var)\s+([\w$]+)\s*=\s*require\(\s*['"`](.+?)['"`]\s*\)/g,
	]

	for (let pattern of patterns) {
		let match: RegExpExecArray | null

		while ((match = pattern.exec(text)) !== null) {
			let importPath = match[2]
			if (!isCSSLikePath(importPath)) {
				continue
			}

			imports.push({
				name: match[1],
				path: importPath,
				pathStart: match.index + match[0].lastIndexOf(importPath),
			})
		}
	}

	return imports
}


/** Find only one css module import path by module name. */
export function findCSSModuleImportPath(text: string, moduleName: string): string | null {
	return findCSSModuleImports(text).find(item => item.name === moduleName)?.path ?? null
}


/** Parse property accesses for bindings that are known CSS Module imports. */
export function* walkCSSModuleParts(text: string, start: number = 0): Iterable<Part> {
	let imports = findCSSModuleImports(text)
	let moduleNames = [...new Set(imports.map(item => item.name))]

	for (let moduleName of moduleNames) {
		let escapedName = escapeAsRegExpSource(moduleName)
		let pattern = new RegExp(`\\b${escapedName}\\s*(?:\\.\\s*[\\w$]*|\\[\\s*['\"\`][\\w$-]*)`, 'g')
		let match: RegExpExecArray | null

		while ((match = pattern.exec(text)) !== null) {
			let matchedText = match[0]
			let moduleNameOffset = match.index + matchedText.indexOf(moduleName)
			let propertyOffset: number
			let propertyText: string

			let dotOffset = matchedText.indexOf('.')
			if (dotOffset > -1) {
				let afterDot = matchedText.slice(dotOffset + 1)
				let whitespaceLength = afterDot.length - afterDot.trimStart().length
				propertyOffset = match.index + dotOffset + 1 + whitespaceLength
				propertyText = afterDot.trimStart()
			}
			else {
				let quoteMatch = /['"`]/.exec(matchedText)
				if (!quoteMatch) {
					continue
				}

				propertyOffset = match.index + quoteMatch.index + 1
				propertyText = matchedText.slice(quoteMatch.index + 1)
			}

			yield new Part(PartType.ImportedCSSModuleName, moduleName, start + moduleNameOffset)
			yield new Part(PartType.ImportedCSSModuleProperty, propertyText, start + propertyOffset)
		}
	}

	for (let item of imports) {
		yield new Part(PartType.CSSImportPath, item.path, start + item.pathStart)
	}
}
