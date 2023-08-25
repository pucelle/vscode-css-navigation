import {Location} from 'vscode-languageserver'
import {HTMLService} from './html-service'
import {FileTracker} from '../../helpers'
import {SimpleSelector} from '../common/simple-selector'
import {TextDocument} from 'vscode-languageserver-textdocument'


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
		this.serviceMap.set(uri, HTMLService.create(document))
	}

	/** Get service by uri. */
	async get(uri: string): Promise<HTMLService | undefined> {
		await this.makeFresh()
		return this.serviceMap.get(uri)
	}

	async findReferencesMatchSelector(selector: SimpleSelector): Promise<Location[]> {
		await this.makeFresh()
		
		let locations: Location[] = []
		for (let htmlService of this.serviceMap.values()) {
			locations.push(...htmlService.findLocationsMatchSelector(selector))
		}
		return locations
	}

	/** Find completion label in for CSS document, from selectors in HTML document. */
	async findCompletionLabelsMatch(prefix: string): Promise<string[]> {
		await this.makeFresh()
		
		let labelSet: Set<string> = new Set()

		for (let htmlService of this.serviceMap.values()) {
			for (let label of htmlService.findCompletionLabelsMatch(prefix)) {
				labelSet.add(label)
			}
		}

		return [...labelSet]
	}
}
