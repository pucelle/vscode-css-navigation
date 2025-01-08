import {SymbolInformation, LocationLink, Hover, Location} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {FileTracker} from '../../helpers'
import {Part} from '../parts'
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

	protected async parseDocument(uri: string, document: TextDocument) {
		this.serviceMap.set(uri, this.createService(document))
	}

	protected *walkAvailableServices(): IterableIterator<S> {
		for (let uri of this.walkIncludedOrOpenedURIs()) {
			if (!this.hasIgnored(uri)) {
				yield this.serviceMap.get(uri)!
			}
		}
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

		if (!this.has(uri) && this.isURIWithinStartPath(uri)) {
			this.trackOpenedDocument(document)
		}

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
		if (!this.has(uri) && this.isURIWithinStartPath(uri)) {
			this.trackMoreFile(URI.parse(uri).fsPath)
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

	async getCompletionLabels(matchPart: Part, fromPart: Part): Promise<Map<string, string | undefined>> {
		await this.beFresh()

		let labelMap: Map<string, string | undefined> = new Map()

		for (let service of this.walkAvailableServices()) {
			for (let [label, detail] of service.getCompletionLabels(matchPart, fromPart)) {
				labelMap.set(label, detail)
			}
		}

		return labelMap
	}

	/** 
	 * Find completion labels match part.
	 * The difference with `getCompletionItems` is that
	 * `matchPart` is a definition part,
	 * but current parts are a reference type of parts.
	 */
	async getReferencedCompletionLabels(fromPart: Part): Promise<Map<string, string | undefined>> {
		await this.beFresh()

		let labelMap: Map<string, string | undefined> = new Map()

		for (let service of this.walkAvailableServices()) {
			for (let [label, detail] of service.getReferencedCompletionLabels(fromPart)) {
				labelMap.set(label, detail)
			}
		}

		return labelMap
	}

	async findReferences(matchDefPart: Part, fromPart: Part): Promise<Location[]> {
		await this.beFresh()
		
		let locations: Location[] = []

		for (let htmlService of this.serviceMap.values()) {
			locations.push(...htmlService.findReferences(matchDefPart, fromPart))
		}

		return locations
	}

	async findHover(matchPart: Part, fromPart: Part, fromDocument: TextDocument, maxStylePropertyCount: number): Promise<Hover | null> {
		await this.beFresh()

		for (let service of this.walkAvailableServices()) {
			let hover = service.findHover(matchPart, fromPart, fromDocument, maxStylePropertyCount)
			if (hover) {
				return hover
			}
		}

		return null
	}

	/** Find all css variable values. */
	async getCSSVariables(names: Set<string>): Promise<Map<string, string>> {
		await this.beFresh()

		let map: Map<string, string> = new Map()

		for (let service of this.walkAvailableServices()) {
			for (let [name, value] of service.getCSSVariables(names)) {
				map.set(name, value)
			}
		}

		return map
	}
}
