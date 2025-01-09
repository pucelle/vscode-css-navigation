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
