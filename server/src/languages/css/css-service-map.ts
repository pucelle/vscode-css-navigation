import * as path from 'path'
import {SymbolInformation, Location, TextDocuments} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {FileTrackerOptions, FileTracker, file} from '../../internal'
import {SimpleSelector} from '../common/simple-selector'
import {CSSService} from './css-service'


export interface CSSServiceMapOptions extends FileTrackerOptions {

	/** Whether ignore css when same name scss files exists. */
	ignoreSameNameCSSFile: boolean
}


/** Gives CSS service for multiple files. */
export class CSSServiceMap extends FileTracker {

	private ignoreSameNameCSSFile: boolean
	private serviceMap: Map<string, CSSService> = new Map()

	constructor(documents: TextDocuments<TextDocument>, options: CSSServiceMapOptions) {
		super(documents, options)
		this.ignoreSameNameCSSFile = options.ignoreSameNameCSSFile
	}

	/** Get service for file. */
	async get(filePath: string): Promise<CSSService | undefined> {
		await this.makeFresh()
		return this.serviceMap.get(filePath)
	}

	protected onFileTracked(filePath: string) {
		if (this.ignoreSameNameCSSFile) {
			let ext = path.extname(filePath).slice(1).toLowerCase()
			if (ext === 'css') {
				let sassOrLessExist = this.has(file.replacePathExtension(filePath, 'scss')) || this.has(file.replacePathExtension(filePath, 'scss'))
				if (sassOrLessExist) {
					this.ignore(filePath)
				}
			}
			else {
				let cssPath = file.replacePathExtension(filePath, 'css')
				if (this.has(cssPath)) {
					this.ignore(cssPath)
				}
			}
		}
	}

	protected onFileExpired(filePath: string) {
		this.serviceMap.delete(filePath)
	}

	protected onFileUntracked(filePath: string) {
		this.serviceMap.delete(filePath)

		if (this.ignoreSameNameCSSFile) {
			let ext = path.extname(filePath).slice(1).toLowerCase()
			if (ext !== 'css') {
				let cssPath = file.replacePathExtension(filePath, 'css')
				if (this.has(cssPath)) {
					this.notIgnore(cssPath)
				}
			}
		}
	}

	/** Parse document to CSS service. */
	protected async parseDocument(filePath: string, document: TextDocument) {
		let cssService = CSSService.create(document)
		this.serviceMap.set(filePath, cssService)

		let importPaths = await cssService.getResolvedImportPaths()
		if (importPaths.length > 0) {
			for (let importPath of importPaths) {
				// Will also parse imported file because are updating.
				this.trackFile(importPath)
			}
		}
	}

	async findDefinitionsMatchSelector(selector: SimpleSelector): Promise<Location[]> {
		await this.makeFresh()
		
		let locations: Location[] = []
		for (let cssService of this.iterateAvailableCSSServices()) {
			locations.push(...cssService.findDefinitionsMatchSelector(selector))
		}
		return locations
	}
	
	async findSymbolsMatchQuery(query: string): Promise<SymbolInformation[]> {
		await this.makeFresh()

		let symbols: SymbolInformation[] = []
		for (let cssService of this.iterateAvailableCSSServices()) {
			symbols.push(...cssService.findSymbolsMatchQuery(query))
		}
		return symbols
	}

	async findCompletionLabelsMatchSelector(selector: SimpleSelector): Promise<string[]> {
		await this.makeFresh()

		let labelSet: Set<string> = new Set()
		for (let cssService of this.iterateAvailableCSSServices()) {
			for (let label of cssService.findCompletionLabelsMatchSelector(selector)) {
				labelSet.add(label)
			}
		}
		return [...labelSet.values()]
	}
	
	private *iterateAvailableCSSServices(): IterableIterator<CSSService> {
		for (let [filePath, cssService] of this.serviceMap.entries()) {
			if (!this.hasIgnored(filePath)) {
				yield cssService
			}
		}
	}
}
