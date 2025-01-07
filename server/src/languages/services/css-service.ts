import {CSSTokenTree} from '../trees'
import {BaseService} from './base-service'


/** Gives CSS service for one CSS file. */
export class CSSService extends BaseService {

	protected makeTree() {
		return CSSTokenTree.fromString(this.document.getText(), 0, this.document.languageId as CSSLanguageId)
	}
}
