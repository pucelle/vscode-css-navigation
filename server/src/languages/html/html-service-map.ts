import {CompletionItem, Location} from 'vscode-languageserver'
import {HTMLService} from './html-service'
import {FileTracker} from '../../helpers'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {Part} from '../trees'


export class HTMLServiceMap extends FileTracker {

	private serviceMap: Map<string, HTMLService> = new Map()

	protected onFileTracked() {}

	protected onFileExpired(uri: string) {
		this.serviceMap.delete(uri)
	}

	protected onFileUntracked(uri: string) {
		this.serviceMap.delete(uri)
	}

	protected async parseDocument(uri: string, document: TextDocument) {
		this.serviceMap.set(uri, new HTMLService(document))
	}

	/** Get HTML service by uri. */
	async get(uri: string): Promise<HTMLService | undefined> {
		await this.makeFresh()
		return this.serviceMap.get(uri)
	}

	async findReferences(fromPart: Part): Promise<Location[]> {
		await this.makeFresh()
		
		let matchPart = fromPart.toHTML()
		let locations: Location[] = []

		for (let htmlService of this.serviceMap.values()) {
			locations.push(...htmlService.findReferences(matchPart))
		}

		return locations
	}

	/** Find completion labels from HTML document, and do complete for CSS documents. */
	async findCompletionLabels(fromPart: Part, fromDocument: TextDocument): Promise<CompletionItem[]> {
		await this.makeFresh()

		let matchPart = fromPart.toHTML()
		let labelSet: Set<string> = new Set()

		for (let cssService of this.serviceMap.values()) {
			for (let label of cssService.findCompletionLabels(matchPart)) {
				labelSet.add(label)
			}
		}

		return fromPart.toCompletionItems([...labelSet.values()], fromDocument)
	}
}
