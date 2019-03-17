import {Location} from 'vscode-languageserver'
import {HTMLService} from './html-service'
import {FileTracker, FileTrackerItem} from '../../libs'
import {SimpleSelector} from '../common/simple-selector'


export class HTMLServiceMap extends FileTracker {

	private serviceMap: Map<string, HTMLService> = new Map()

	protected onTrack() {}

	protected onExpired(filePath: string) {
		this.serviceMap.delete(filePath)
	}

	protected onUnTrack(filePath: string) {
		this.serviceMap.delete(filePath)
	}

	protected async onUpdate(filePath: string, item: FileTrackerItem) {
		if (item.document) {
			this.serviceMap.set(filePath, HTMLService.create(item.document))

			//very important, release document memory usage after symbols generated
			item.document = null
		}
	}

	get(filePath: string): HTMLService | undefined {
		return this.serviceMap.get(filePath)
	}

	async findReferencesMatchSelector(selector: SimpleSelector): Promise<Location[]> {
		await this.beFresh()
		
		let locations: Location[] = []
		for (let htmlService of this.serviceMap.values()) {
			locations.push(...htmlService.findLocationsMatchSelector(selector))
		}
		return locations
	}
}
