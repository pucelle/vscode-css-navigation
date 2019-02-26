import * as path from 'path'

import {SymbolInformation, Location} from 'vscode-languageserver'
import {FileTrackerOptions, FileTracker, TrackMapItem} from '../file-tracker'
import {SimpleSelector} from '../html/html-service'
import {CSSSymbol} from './css-symbol'
import {replaceExtension} from '../util'


interface CSSSymbolMapOptions extends FileTrackerOptions{
	ignoreSameNameCSSFile: boolean
}

export class CSSSymbolMap extends FileTracker {

	private ignoreSameNameCSSFile: boolean
	private cssSymbolMap: Map<string, CSSSymbol> = new Map()

	constructor(options: CSSSymbolMapOptions) {
		super(options)
		this.ignoreSameNameCSSFile = options.ignoreSameNameCSSFile
	}

	protected onTrack(filePath: string, item: TrackMapItem) {
		if (this.ignoreSameNameCSSFile) {
			let ext = path.extname(filePath).slice(1).toLowerCase()
			if (ext === 'css') {
				let sassOrLessExist = this.has(replaceExtension(filePath, 'scss')) || this.has(replaceExtension(filePath, 'scss'))
				if (sassOrLessExist) {
					this.ignore(filePath)
				}
			}
			else {
				let cssPath = replaceExtension(filePath, 'css')
				if (this.has(cssPath)) {
					this.ignore(cssPath)
				}
			}
		}
	}

	protected onExpired(filePath: string, item: TrackMapItem) {
		this.cssSymbolMap.delete(filePath)
	}

	protected onUnTrack(filePath: string, item: TrackMapItem) {
		this.cssSymbolMap.delete(filePath)

		let ext = path.extname(filePath).slice(1).toLowerCase()
		if (ext !== 'css') {
			let cssPath = replaceExtension(filePath, 'css')
			if (this.has(cssPath)) {
				this.notIgnore(cssPath)
			}
		}
	}

	protected async onUpdate(filePath: string, item: TrackMapItem) {
		if (item.document) {
			this.cssSymbolMap.set(filePath, CSSSymbol.create(item.document))

			//very important, release document memory usage after symbols generated
			item.document = null
		}
	}

	private *iterateAvailableCSSSymbols(): IterableIterator<CSSSymbol> {
		for (let [filePath, cssSymbol] of this.cssSymbolMap.entries()) {
			if (!this.hasIgnored(filePath)) {
				yield cssSymbol
			}
		}
	}

	async findDefinitionMatchSelector(selector: SimpleSelector): Promise<Location[]> {
		await this.beFresh()
		
		let locations: Location[] = []
		for (let cssSymbol of this.iterateAvailableCSSSymbols()) {
			locations.push(...cssSymbol.findLocationsMatchSelector(selector))
		}
		return locations
	}
	
	async findSymbolsMatchQuery(query: string): Promise<SymbolInformation[]> {
		await this.beFresh()

		let symbols: SymbolInformation[] = []
		for (let cssSymbol of this.iterateAvailableCSSSymbols()) {
			symbols.push(...cssSymbol.findSymbolsMatchQuery(query))
		}
		return symbols
	}

	async findCompletionMatchSelector(selector: SimpleSelector): Promise<string[]> {
		await this.beFresh()

		let labelSet: Set<string> = new Set()
		for (let cssSymbol of this.iterateAvailableCSSSymbols()) {
			for (let label of cssSymbol.findCompletionMatchSelector(selector)) {
				labelSet.add(label)
			}
		}
		return [...labelSet.values()]
	}
}

