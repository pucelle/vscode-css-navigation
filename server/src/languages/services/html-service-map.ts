import {HTMLService} from './html-service'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {BaseServiceMap} from './base-service-map'
import {Part} from '../trees'
import {CompletionItem} from 'vscode-languageserver'


export class HTMLServiceMap extends BaseServiceMap<HTMLService> {

	protected createService(document: TextDocument) {
		return new HTMLService(document)
	}

	/** 
	 * Find completion labels match part.
	 * The difference with `getCompletionItems` is that
	 * `matchPart` is a definition part,
	 * but current parts are a reference type of parts.
	 */
	async getReferencedCompletionItems(fromPart: Part, fromDocument: TextDocument): Promise<CompletionItem[]> {
		await this.beFresh()

		let labelSet: Set<string> = new Set()

		for (let service of this.walkAvailableServices()) {
			for (let label of service.getReferencedCompletionLabels(fromPart)) {
				labelSet.add(label)
			}
		}

		return fromPart.toCompletionItems([...labelSet.values()], fromDocument)
	}
}
