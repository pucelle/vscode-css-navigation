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
	const imports: CSSModuleImport[] = []

	const patterns = [
		/import\s+(?:\*\s+as\s+)?([\w$]+)\s+from\s+['"`](.+?)['"`]/g,
		/(?:const|let|var)\s+([\w$]+)\s*=\s*require\(\s*['"`](.+?)['"`]\s*\)/g,
	]

	for (const pattern of patterns) {
		let match: RegExpExecArray | null

		while ((match = pattern.exec(text)) !== null) {
			const importPath = match[2]
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
	const imports = findCSSModuleImports(text)
	const moduleNames = [...new Set(imports.map(item => item.name))]

	for (const moduleName of moduleNames) {
		const escapedName = escapeAsRegExpSource(moduleName)
		const pattern = new RegExp(`\\b${escapedName}\\s*(?:\\.\\s*[\\w$]*|\\[\\s*['\"\`][\\w$-]*)`, 'g')
		let match: RegExpExecArray | null

		while ((match = pattern.exec(text)) !== null) {
			const matchedText = match[0]
			const moduleNameOffset = match.index + matchedText.indexOf(moduleName)
			let propertyOffset: number
			let propertyText: string

			const dotOffset = matchedText.indexOf('.')
			if (dotOffset > -1) {
				const afterDot = matchedText.slice(dotOffset + 1)
				const whitespaceLength = afterDot.length - afterDot.trimStart().length
				propertyOffset = match.index + dotOffset + 1 + whitespaceLength
				propertyText = afterDot.trimStart()
			}
			else {
				const quoteMatch = /['"`]/.exec(matchedText)
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

	for (const item of imports) {
		yield new Part(PartType.CSSImportPath, item.path, start + item.pathStart)
	}
}
