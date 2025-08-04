import {TextDocument} from 'vscode-languageserver-textdocument'
import {PartType} from '../parts'
import {HTMLTokenTree, JSTokenTree} from '../trees'
import {BaseService} from './base-service'


const HTMLLanguageIdMap: Record<string, HTMLLanguageId> = {

	// If document opened.
	'javascriptreact': 'jsx',
	'typescriptreact': 'tsx',
	'javascript': 'js',
	'typescript': 'ts',

	// If document closed.
	'jsx': 'jsx',
	'js': 'js',
	'tsx': 'tsx',
	'ts': 'ts',
}


/** Scan html code pieces in files that can include HTML codes, like html, js, jsx, ts, tsx. */
export class HTMLService extends BaseService {

	/** All class names references and their count for diagnostic, names excluded identifier `.`. */
	protected classNamesReferenceSet: Map<string, number> = new Map()

	constructor(document: TextDocument, config: Configuration) {
		super(document, config)
		this.initClassNamesReferenceSet()
	}

	protected initClassNamesReferenceSet() {
		if (!this.config.enableClassNameReferenceDiagnostic) {
			return
		}

		let classTexts = [
			...this.partMap.get(PartType.Class)?.map(p => p.text) || [],
			...this.partMap.get(PartType.CSSSelectorQueryClass)?.map(p => p.text.slice(1)) || [],
			...this.partMap.get(PartType.ReactDefaultImportedCSSModuleClass)?.map(p => p.text) || [],
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

	protected makeTree() {
		let languageId = HTMLLanguageIdMap[this.document.languageId] ?? 'html'
		if (languageId === 'html') {
			return HTMLTokenTree.fromString(this.document.getText(), 0, languageId)
		}
		else {
			return JSTokenTree.fromString(this.document.getText(), 0, languageId)
		}
	}
}
