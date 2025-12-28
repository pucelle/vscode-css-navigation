import {TextDocument} from 'vscode-languageserver-textdocument'
import {PartType} from '../parts'
import {HTMLTokenTree, JSTokenTree} from '../trees'
import {BaseService} from './base-service'
import path = require('node:path')
import {LanguageIds} from '../language-ids'


/** If document opened. */
const HTMLLanguageIdMap: Record<string, HTMLLanguageId> = {
	'javascriptreact': 'jsx',
	'typescriptreact': 'tsx',
	'javascript': 'js',
	'typescript': 'ts',
}

/** If document closed, or language plugin not installed. */
const HTMLLanguageExtensionMap: Record<string, HTMLLanguageId> = {
	'jsx': 'jsx',
	'js': 'js',
	'tsx': 'tsx',
	'ts': 'ts',
	'vue': 'vue',
}


/** Scan html code pieces in files that can include HTML codes, like html, js, jsx, ts, tsx. */
export class HTMLService extends BaseService {

	/** All class names references and their count for diagnostic, names excluded identifier `.`. */
	protected classNamesReferenceSet: Map<string, number> = new Map()

	constructor(document: TextDocument, config: Configuration, classNameRegExp: RegExp | null) {
		super(document, config, classNameRegExp)
		this.initClassNamesReferenceSet()
	}

	protected initClassNamesReferenceSet() {
		if (!this.config.enableClassNameReferenceDiagnostic) {
			return
		}

		let classTexts = [
			...this.partMap.get(PartType.Class)?.map(p => p.escapedText) || [],
			...this.partMap.get(PartType.ReactImportedCSSModuleProperty)?.map(p => p.escapedText) || [],
			...this.partMap.get(PartType.CSSSelectorQueryClass)?.map(p => p.escapedText.slice(1)) || [],
			...this.partMap.get(PartType.ReactDefaultImportedCSSModuleClass)?.map(p => p.escapedText) || [],
		]

		for (let text of classTexts) {
			this.classNamesReferenceSet.set(text, (this.classNamesReferenceSet.get(text) ?? 0) + 1)
		}
	}

	/** Get all referenced class names and their count. */
	getReferencedClassNamesSet(): Map<string, number> {
		return this.classNamesReferenceSet
	}

	/** 
	 * Test whether referenced class name existing.
	 * `className` must not have identifier `.`.
	 */
	hasReferencedClassName(className: string): boolean {
		return this.classNamesReferenceSet.has(className)
	}

	/** Get referenced class name count. */
	getReferencedClassNameCount(className: string): number {
		return this.classNamesReferenceSet.get(className) ?? 0
	}

	protected makeTree(classNameRegExp: RegExp | null) {
		let extension = path.extname(this.document.uri).slice(1).toLowerCase()
		let languageId = HTMLLanguageIdMap[this.document.languageId] ?? HTMLLanguageExtensionMap[extension] ?? 'html'
		
		if (LanguageIds.isHTMLSyntax(languageId)) {
			return HTMLTokenTree.fromString(this.document.getText(), 0, languageId, classNameRegExp)
		}
		else {
			return JSTokenTree.fromString(this.document.getText(), 0, languageId, classNameRegExp)
		}
	}
}
