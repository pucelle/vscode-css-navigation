import * as path from 'path'
import {SymbolInformation, Location} from 'vscode-languageserver'
import {FileTrackerOptions, FileTracker, FileTrackerItem, file} from '../../libs'
import {SimpleSelector} from '../common/simple-selector'
import {CSSService} from './css-service'


export interface CSSServiceMapOptions extends FileTrackerOptions{
	ignoreSameNameCSSFile: boolean
}

export class CSSServiceMap extends FileTracker {

	private ignoreSameNameCSSFile: boolean
	private serviceMap: Map<string, CSSService> = new Map()

	constructor(options: CSSServiceMapOptions) {
		super(options)
		this.ignoreSameNameCSSFile = options.ignoreSameNameCSSFile
	}

	async get(filePath: string): Promise<CSSService | undefined> {
		await this.beFresh()
		return this.serviceMap.get(filePath)
	}

	protected onTrack(filePath: string) {
		if (this.ignoreSameNameCSSFile) {
			let ext = path.extname(filePath).slice(1).toLowerCase()
			if (ext === 'css') {
				let sassOrLessExist = this.has(file.replaceExtension(filePath, 'scss')) || this.has(file.replaceExtension(filePath, 'scss'))
				if (sassOrLessExist) {
					this.ignore(filePath)
				}
			}
			else {
				let cssPath = file.replaceExtension(filePath, 'css')
				if (this.has(cssPath)) {
					this.ignore(cssPath)
				}
			}
		}
	}

	protected onExpired(filePath: string) {
		this.serviceMap.delete(filePath)
	}

	protected onUnTrack(filePath: string) {
		this.serviceMap.delete(filePath)

		if (this.ignoreSameNameCSSFile) {
			let ext = path.extname(filePath).slice(1).toLowerCase()
			if (ext !== 'css') {
				let cssPath = file.replaceExtension(filePath, 'css')
				if (this.has(cssPath)) {
					this.notIgnore(cssPath)
				}
			}
		}
	}

	protected async onUpdate(filePath: string, item: FileTrackerItem) {
		if (item.document) {
			this.serviceMap.set(filePath, CSSService.create(item.document))

			//very important, release document memory usage after symbols generated
			item.document = null
		}
	}

	private *iterateAvailableCSSServices(): IterableIterator<CSSService> {
		for (let [filePath, cssService] of this.serviceMap.entries()) {
			if (!this.hasIgnored(filePath)) {
				yield cssService
			}
		}
	}

	async findDefinitionMatchSelector(selector: SimpleSelector): Promise<Location[]> {
		await this.beFresh()
		
		let locations: Location[] = []
		for (let cssService of this.iterateAvailableCSSServices()) {
			locations.push(...cssService.findDefinitionsMatchSelector(selector))
		}
		return locations
	}
	
	async findSymbolsMatchQuery(query: string): Promise<SymbolInformation[]> {
		await this.beFresh()

		let symbols: SymbolInformation[] = []
		for (let cssService of this.iterateAvailableCSSServices()) {
			symbols.push(...cssService.findSymbolsMatchQuery(query))
		}
		return symbols
	}

	async findCompletionLabelsMatchSelector(selector: SimpleSelector): Promise<string[]> {
		await this.beFresh()

		let labelSet: Set<string> = new Set()
		for (let cssService of this.iterateAvailableCSSServices()) {
			for (let label of cssService.findCompletionLabelsMatchSelector(selector)) {
				labelSet.add(label)
			}
		}
		return [...labelSet.values()]
	}
}
