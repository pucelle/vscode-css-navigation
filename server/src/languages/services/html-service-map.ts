import {HTMLService} from './html-service'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {BaseServiceMap} from './base-service-map'


export class HTMLServiceMap extends BaseServiceMap<HTMLService> {

	protected createService(document: TextDocument) {
		return new HTMLService(document)
	}
}
