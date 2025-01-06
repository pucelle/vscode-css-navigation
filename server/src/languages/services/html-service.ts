import {TextDocument} from 'vscode-languageserver-textdocument'
import {HTMLTokenTree, JSTokenTree} from '../trees'
import {BaseService} from './base-service'


const HTMLLanguageIdMap: Record<string, HTMLLanguageId> = {
	'javascriptreact': 'jsx',
	'typescriptreact': 'tsx',
	'javascript': 'js',
	'typescript': 'ts',
}


/** Scan html code pieces in files that can include HTML codes, like html, js, jsx, ts, tsx. */
export class HTMLService extends BaseService {

	constructor(document: TextDocument) {
		super(document)

		let languageId = HTMLLanguageIdMap[document.languageId] ?? 'html'
		if (languageId === 'html') {
			let tree = HTMLTokenTree.fromString(document.getText(), 0, languageId)
			this.parts = [...tree.walkParts()]
		}
		else {
			let tree = JSTokenTree.fromString(document.getText(), 0, languageId)
			this.parts = [...tree.walkParts()]
		}
	}
}
