import * as path from 'path'
import {SymbolInformation, Location, TextDocuments} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {FileTrackerOptions, FileTracker, file} from '../../helpers'
import {SimpleSelector} from '../common/simple-selector'
import {CSSService} from './css-service'


export interface CSSServiceMapOptions extends FileTrackerOptions {

	/** Whether always include files specified by `@import ...` */
	includeImportedFiles: boolean

	/** Whether ignore css when same name scss files exists. */
	ignoreSameNameCSSFile: boolean
}


/** Gives CSS service for multiple files. */
export class CSSServiceMap extends FileTracker {

	private includeImportedFiles: boolean
	private ignoreSameNameCSSFile: boolean
	private serviceMap: Map<string, CSSService> = new Map()

	constructor(documents: TextDocuments<TextDocument>, options: CSSServiceMapOptions) {
		super(documents, options)
		this.includeImportedFiles = options.includeImportedFiles
		this.ignoreSameNameCSSFile = options.ignoreSameNameCSSFile
	}

	/** Get service by uri. */
	async get(uri: string): Promise<CSSService | undefined> {
		await this.makeFresh()
		return this.serviceMap.get(uri)
	}

	protected onFileTracked(uri: string) {
		// If same name scss or less files exist, ignore css files.
		if (this.ignoreSameNameCSSFile) {
			let ext = path.extname(uri).slice(1).toLowerCase()
			if (ext === 'css') {
				let sassOrLessExist = this.has(file.replacePathExtension(uri, 'scss'))
					|| this.has(file.replacePathExtension(uri, 'less'))
					|| this.has(file.replacePathExtension(uri, 'sass'))

				if (sassOrLessExist) {
					this.ignore(uri)
				}
			}
			else {
				let cssPath = file.replacePathExtension(uri, 'css')
				if (this.has(cssPath)) {
					this.ignore(cssPath)
				}
			}
		}
	}

	protected onFileExpired(uri: string) {
		this.serviceMap.delete(uri)
	}

	protected onFileUntracked(uri: string) {
		this.serviceMap.delete(uri)

		// If same name scss files deleted, unignore css files.
		if (this.ignoreSameNameCSSFile) {
			let ext = path.extname(uri).slice(1).toLowerCase()
			if (ext !== 'css') {
				let cssPath = file.replacePathExtension(uri, 'css')
				if (this.has(cssPath)) {
					this.notIgnore(cssPath)
				}
			}
		}
	}

	/** Parse document to CSS service. */
	protected async parseDocument(uri: string, document: TextDocument) {
		let cssService = CSSService.create(document, this.includeImportedFiles)
		this.serviceMap.set(uri, cssService)

		// If having `@import ...`
		let importPaths = await cssService.getResolvedImportPaths()
		if (importPaths.length > 0) {
			for (let importPath of importPaths) {
				// Will also parse imported file because are updating.
				this.trackMoreFile(importPath)
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
		for (let [uri, cssService] of this.serviceMap.entries()) {
			if (!this.hasIgnored(uri)) {
				yield cssService
			}
		}
	}
}
