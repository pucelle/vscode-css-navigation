import {Location} from 'vscode-languageserver'
import {HTMLService} from './html-service'
import {FileTracker} from '../../internal'
import {SimpleSelector} from '../common/simple-selector'
import {TextDocument} from 'vscode-languageserver-textdocument'


export class HTMLServiceMap extends FileTracker {

	private serviceMap: Map<string, HTMLService> = new Map()

	protected onFileTracked() {}

	protected onFileExpired(filePath: string) {
		this.serviceMap.delete(filePath)
	}

	protected onFileUntracked(filePath: string) {
		this.serviceMap.delete(filePath)
	}

	protected async parseDocument(filePath: string, document: TextDocument) {
		this.serviceMap.set(filePath, HTMLService.create(document))
	}

	/** Get a HTML service from file. */
	get(filePath: string): HTMLService | undefined {
		return this.serviceMap.get(filePath)
	}

	async findReferencesMatchSelector(selector: SimpleSelector): Promise<Location[]> {
		await this.makeFresh()
		
		let locations: Location[] = []
		for (let htmlService of this.serviceMap.values()) {
			locations.push(...htmlService.findLocationsMatchSelector(selector))
		}
		return locations
	}
}
