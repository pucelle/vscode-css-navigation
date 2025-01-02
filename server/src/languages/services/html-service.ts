import {TextDocument} from 'vscode-languageserver-textdocument'
import {HTMLTokenTree, Part, PartConvertor} from '../trees'
import {BaseService} from './base-service'
import {CompletionItem} from 'vscode-languageserver'


/** Scan html code pieces in files that can include HTML codes, like html, js, jsx, ts, tsx. */
export class HTMLService extends BaseService {

	constructor(document: TextDocument) {
		super(document)

		let isJSLikeSyntax = ['javascriptreact', 'typescriptreact', 'javascript', 'typescript'].includes(document.languageId)
		let tree = HTMLTokenTree.fromString(document.getText(), 0, isJSLikeSyntax)
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
		let re = PartConvertor.makeMayIdentifierStartsMatchExp(fromPart.text, fromPart.type)
		let definitionPart = fromPart.toDefinitionMode()

		for (let part of this.parts) {
			if (!part.isTypeMatchAsReference(definitionPart)) {
				continue
			}

			if (!part.isTextExpMatch(re)) {
				continue
			}

			for (let text of part.textList) {
				labelSet.add(PartConvertor.textToType(text, part.type, fromPart.type))
			}
		}

		return [...labelSet.values()]
	}

	/** Get completion items match part.
	 * For mode details see `getReferencedCompletionLabels`.
	 */
	getReferencedCompletionItems(fromPart: Part, fromDocument: TextDocument): CompletionItem[] {
		let labels = this.getReferencedCompletionLabels(fromPart)
		return PartConvertor.toCompletionItems(fromPart, labels, fromDocument)
	}
}
