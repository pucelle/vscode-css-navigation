import {TextDocument} from 'vscode-languageserver-textdocument'
import {HTMLTokenTree} from '../trees'
import {BaseService} from './base-service'


/** Scan html code pieces in files that can include HTML codes, like html, js, jsx, ts, tsx. */
export class HTMLService extends BaseService {

	constructor(document: TextDocument) {
		super(document)

		let isJSLikeSyntax = ['javascriptreact', 'typescriptreact', 'javascript', 'typescript'].includes(document.languageId)
		let tree = HTMLTokenTree.fromString(document.getText(), 0, isJSLikeSyntax)
		this.parts = [...tree.walkParts()]
	}
}
