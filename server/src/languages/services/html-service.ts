import {TextDocument} from 'vscode-languageserver-textdocument'
import {HTMLTokenTree, Part} from '../trees'
import {BaseService} from './base-service'
import {CompletionItem} from 'vscode-languageserver'


/** Scan html code pieces in files that can include HTML codes, like html, js, jsx, ts, tsx. */
export class HTMLService extends BaseService {

	constructor(document: TextDocument) {
		super(document)

		let isJSLikeSyntax = ['javascriptreact', 'typescriptreact', 'javascript', 'typescript'].includes(document.languageId)
		let tree = HTMLTokenTree.fromString(document.getText(), isJSLikeSyntax)
		this.parts = [...tree.walkParts()]
	}

	
	/** 
	 * Get completion labels match part.
	 * The difference with `getCompletionLabels` is that
	 * `fromPart` is a definition part like class name selector,
	 * but current parts are a reference type of parts.
	 */
	getReferencedCompletionLabels(fromPart: Part): string[] {
		let labelSet: Set<string> = new Set()
		let re = Part.makeStartsMatchExp(fromPart.text)

		for (let part of this.parts) {
			if (part.isTypeMatchAsReference(fromPart)) {
				continue
			}

			if (!part.isTextExpMatch(re)) {
				continue
			}

			for (let text of part.textList) {
				labelSet.add(text)
			}
		}

		return [...labelSet.values()]
	}

	/** Get completion items match part.
	 * For mode details see `getReferencedCompletionLabels`.
	 */
	getReferencedCompletionItems(fromPart: Part, fromDocument: TextDocument): CompletionItem[] {
		let labels = this.getReferencedCompletionLabels(fromPart)
		return fromPart.toCompletionItems(labels, fromDocument)
	}
}
