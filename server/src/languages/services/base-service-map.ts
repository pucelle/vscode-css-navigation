import {SymbolInformation, LocationLink, CompletionItem, Hover, Location} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {FileTracker} from '../../helpers'
import {Part, PartConvertor} from '../parts'
import {BaseService} from './base-service'
import {URI} from 'vscode-uri'



/** Gives HTML/CSS service for multiple files. */
export abstract class BaseServiceMap<S extends BaseService> extends FileTracker {

	protected serviceMap: Map<string, S> = new Map()

	protected onFileExpired(uri: string) {
		this.serviceMap.delete(uri)
	}

	protected onFileUntracked(uri: string) {
		this.serviceMap.delete(uri)
	}

	protected onReleaseResources() {
		this.serviceMap.clear()
	}

	protected *walkAvailableServices(): IterableIterator<S> {
		for (let [uri, service] of this.serviceMap.entries()) {
			if (!this.hasIgnored(uri)) {
				yield service
			}
		}
	}

	protected async parseDocument(uri: string, document: TextDocument) {
		this.serviceMap.set(uri, this.createService(document))
	}

	/** 
	 * Get CSS service by uri after becoming fresh.
	 * Get undefined if not in cache.
	 */
	async get(uri: string): Promise<S | undefined> {
		await this.uriBeFresh(uri)
		return this.serviceMap.get(uri)
	}

	/** Force get a service by document, create it but not cache if not in service map. */
	async forceGetServiceByDocument(document: TextDocument): Promise<S> {
		let uri = document.uri

		// Already included.
		if (this.has(uri)) {
			return this.get(uri) as Promise<S>
		}

		// Cache missed, normally will not happen.
		let htmlService = this.createService(document)
		return htmlService
	}

	/** Force get a service by file path, create it but not cache if not in service map. */
	async forceGetServiceByFilePath(fsPath: string): Promise<S | null> {
		let uri = URI.file(fsPath).toString()
		return this.forceGetServiceByURI(uri)
	}

	/** Force get a service by uri, create it but not cache if not in service map. */
	async forceGetServiceByURI(uri: string): Promise<S | null> {

		// Path been included.
		if (!this.has(uri) && this.startPath) {
			let filePath = URI.parse(uri).fsPath

			if (filePath.startsWith(this.startPath)) {
				this.trackMoreFile(filePath)
			}
		}

		// Already included.
		if (this.has(uri)) {
			return this.get(uri) as Promise<S>
		}

		// Cache missed, normally will not happen.
		let document = await this.loadDocument(uri)
		if (!document) {
			return null
		}

		let htmlService = this.createService(document)
		return htmlService
	}

	/** Parse document to CSS service. */
	protected abstract createService(document: TextDocument): S

	async findDefinitions(matchPart: Part, fromPart: Part, fromDocument: TextDocument): Promise<LocationLink[]> {
		await this.beFresh()

		let locations: LocationLink[] = []

		for (let service of this.walkAvailableServices()) {
			locations.push(...service.findDefinitions(matchPart, fromPart, fromDocument))
		}

		return locations
	}
	
	async findSymbols(query: string): Promise<SymbolInformation[]> {
		await this.beFresh()

		let symbols: SymbolInformation[] = []

		for (let service of this.walkAvailableServices()) {
			symbols.push(...service.findSymbols(query))
		}

		return symbols
	}

	async getCompletionItems(matchPart: Part, fromPart: Part, fromDocument: TextDocument): Promise<CompletionItem[]> {
		await this.beFresh()

		let labelSet: Set<string> = new Set()

		for (let service of this.walkAvailableServices()) {
			for (let label of service.getCompletionLabels(matchPart, fromPart)) {
				labelSet.add(label)
			}
		}

		return PartConvertor.toCompletionItems(fromPart, [...labelSet.values()], fromDocument)
	}

	async findReferences(fromPart: Part): Promise<Location[]> {
		await this.beFresh()
		
		let locations: Location[] = []

		for (let htmlService of this.serviceMap.values()) {
			locations.push(...htmlService.findReferences(fromPart))
		}

		return locations
	}

	async findHover(matchPart: Part, fromDocument: TextDocument, maxStylePropertyCount: number): Promise<Hover | null> {
		await this.beFresh()

		for (let service of this.walkAvailableServices()) {
			let hover = service.findHover(matchPart, fromDocument, maxStylePropertyCount)
			if (hover) {
				return hover
			}
		}

		return null
	}
}
