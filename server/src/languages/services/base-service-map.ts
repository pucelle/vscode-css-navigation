import {SymbolInformation, TextDocuments, LocationLink, CompletionItem, Hover, Location} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {FileTrackerOptions, FileTracker} from '../../helpers'
import {CSSSelectorPart, Part} from '../trees'
import {BaseService} from './base-service'
import {URI} from 'vscode-uri'


export interface BaseServiceMapOptions extends FileTrackerOptions {

	/** If not use service after some milliseconds, release all resources. */
	releaseTimeoutMs?: number
}


/** Gives HTML/CSS service for multiple files. */
export abstract class BaseServiceMap<S extends BaseService> extends FileTracker {

	protected serviceMap: Map<string, S> = new Map()
	protected releaseTimeoutMs: number
	protected releaseTimeout: NodeJS.Timeout | null = null

	constructor(documents: TextDocuments<TextDocument>, options: BaseServiceMapOptions) {
		super(documents, options)
		this.releaseTimeoutMs = options.releaseTimeoutMs ?? Infinity
	}

	protected onFileExpired(uri: string) {
		this.serviceMap.delete(uri)
	}

	protected onFileUntracked(uri: string) {
		this.serviceMap.delete(uri)
	}

	async beFresh() {
		await super.beFresh()
		this.mayResetTimeout()
	}

	protected mayResetTimeout() {
		if (this.releaseTimeout) {
			clearTimeout(this.releaseTimeout)
		}

		if (isFinite(this.releaseTimeoutMs)) {
			this.releaseTimeout = setTimeout(this.releaseResources.bind(this), this.releaseTimeoutMs)
		}
	}

	protected releaseResources() {
		this.serviceMap.clear()
		this.allFresh = false
		this.startDataLoaded = false
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

	/** Force get a service by file path, create it but not cache if not in service map. */
	async forceGetServiceByURI(fsPath: string): Promise<S | null> {
		let uri = URI.file(fsPath).toString()

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
			for (let label of service.getCompletionLabels(matchPart)) {
				labelSet.add(label)
			}
		}

		// Removes match part itself.
		labelSet.delete(matchPart.text)

		return fromPart.toCompletionItems([...labelSet.values()], fromDocument)
	}

	async findReferences(fromPart: Part): Promise<Location[]> {
		await this.beFresh()
		
		let locations: Location[] = []

		for (let htmlService of this.serviceMap.values()) {
			locations.push(...htmlService.findReferences(fromPart))
		}

		return locations
	}

	async findHover(matchPart: Part, fromPart: Part, fromDocument: TextDocument): Promise<Hover | null> {
		await this.beFresh()

		let parts: CSSSelectorPart[] = []

		for (let service of this.walkAvailableServices()) {
			parts.push(...service.findHoverParts(matchPart))
		}

		if (parts.length === 0) {
			return null
		}

		let commentedParts = parts.filter(p => p.comment)
		let part = commentedParts.find(part => part.detail!.independent) ?? commentedParts[0]

		return fromPart.toHover(part?.comment!, fromDocument)
	}
}
