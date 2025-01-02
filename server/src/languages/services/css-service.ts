import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSTokenTree} from '../trees'
import {BaseService} from './base-service'


/** Gives CSS service for one CSS file. */
export class CSSService extends BaseService {

	constructor(document: TextDocument) {
		super(document)

		let tree = CSSTokenTree.fromString(document.getText(), 0, document.languageId as CSSLanguageId)
		this.parts = [...tree.walkParts()]
	}
}
