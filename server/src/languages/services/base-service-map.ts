import {SymbolInformation, LocationLink, Hover, Location, TextDocuments, RemoteWindow} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {FileTracker, FileTrackerOptions, Logger} from '../../core'
import {Part, PartConvertor} from '../parts'
import {BaseService} from './base-service'
import {CompletionLabel} from './types'


/** Gives HTML/CSS service for multiple files. */
export abstract class BaseServiceMap<S extends BaseService> extends FileTracker {
	
	readonly config: Configuration

	/** HTML or CSS Service map by uri. */
	protected serviceMap: Map<string, S> = new Map()

	/** The timestamp when last time using service. */
	protected timestamp: number = 0

	constructor(
		documents: TextDocuments<TextDocument>,
		window: RemoteWindow,
		options: FileTrackerOptions,
		config: Configuration
	) {
		super(documents, window, options)
		this.config = config
	}

	/** Update timestamp. */
	updateTimestamp(time: number) {
		this.timestamp = time
	}

	protected override onFileExpired(uri: string) {
		this.serviceMap.delete(uri)
	}

	protected override onFileUntracked(uri: string) {
		this.serviceMap.delete(uri)
	}

	protected override onReleaseResources() {
		this.serviceMap.clear()
	}

	// eslint-disable-next-line @typescript-eslint/require-await -- overrides FileTracker.parseDocument, whose contract returns a Promise
	protected override async parseDocument(uri: string, document: TextDocument) {
		try {
			let service = this.createService(document)
			this.serviceMap.set(uri, service)
		}
		catch (err) {
			Logger.error(`Failed to parse ${uri}, please contact me on github`)
			Logger.error(err)
		}
	}

	protected *walkAvailableServices(): IterableIterator<S> {
		for (let uri of this.trackingMap.walkActiveURIs()) {
			if (this.serviceMap.has(uri)) {
				this.trackingMap.setUseTime(uri, this.timestamp)
				yield this.serviceMap.get(uri)!
			}
		}
	}

	/** 
	 * Get CSS service by uri after becoming fresh.
	 * Get undefined if not in cache.
	 */
	async getFreshly(uri: string): Promise<S | undefined> {
		await this.uriBeFresh(uri)
		this.trackingMap.setUseTime(uri, this.timestamp)

		return this.serviceMap.get(uri)
	}

	/** Force get a service by document, create it and cache as opened document. */
	async forceGetServiceByDocument(document: TextDocument): Promise<S | undefined> {
		let uri = document.uri

		if (!this.trackingMap.has(uri)) {
			this.trackOpenedDocument(document)
		}

		return this.getFreshly(uri)
	}

	/** Force get a service by uri, create it but not cache. */
	async forceGetServiceByURI(uri: string): Promise<S | undefined> {

		// Cache it in map.
		if (!this.trackingMap.has(uri)) {
			this.trackMoreURI(uri)
		}

		// Already included.
		return this.getFreshly(uri)
	}

	/** Parse document to CSS service. */
	protected abstract createService(document: TextDocument): S

	async findDefinitions(
		matchPart: Part,
		fromPart: Part,
		fromDocument: TextDocument,
		contextMatchParts: readonly Part[] = []
	): Promise<LocationLink[]> {
		await this.beFresh()
		return this.findDefinitionsFromServices([...this.walkAvailableServices()], matchPart, fromPart, fromDocument, contextMatchParts)
	}

	/** Collect raw definition matches across services, choose globally, then build locations. */
	findDefinitionsFromServices(
		services: readonly BaseService[],
		matchPart: Part,
		fromPart: Part,
		fromDocument: TextDocument,
		contextMatchParts: readonly Part[] = []
	): LocationLink[] {
		let normal: {service: BaseService, part: Part}[] = []
		let contextual: {service: BaseService, part: Part}[] = []

		for (let service of services) {
			let matches = service.findDefinitionMatchParts(matchPart, contextMatchParts)
			normal.push(...matches.normal.map(part => ({service, part})))
			contextual.push(...matches.contextual.map(part => ({service, part})))
		}

		return (contextual.length > 0 ? contextual : normal).map(({service, part}) => {
			return PartConvertor.toLocationLink(part, service.document, fromPart, fromDocument)
		})
	}
	
	async findSymbols(query: string): Promise<SymbolInformation[]> {
		await this.beFresh()

		let symbols: SymbolInformation[] = []

		for (let service of this.walkAvailableServices()) {
			symbols.push(...service.findSymbols(query))
		}

		return symbols
	}

	async getCompletionLabels(matchPart: Part, fromPart: Part, maxHoverStylePropertyCount: number): Promise<Map<string, CompletionLabel | null>> {
		await this.beFresh()

		let labelMap: Map<string, CompletionLabel | null> = new Map()

		for (let service of this.walkAvailableServices()) {
			for (const [label, item] of service.getCompletionLabels(matchPart, fromPart, maxHoverStylePropertyCount)) {
				labelMap.set(label, item)
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
	async getReferencedCompletionLabels(fromPart: Part): Promise<Map<string, CompletionLabel | null>> {
		await this.beFresh()

		let labelMap: Map<string, CompletionLabel | null> = new Map()

		for (let service of this.walkAvailableServices()) {
			for (const [label, detail] of service.getReferencedCompletionLabels(fromPart)) {
				labelMap.set(label, detail)
			}
		}

		return labelMap
	}

	async findReferences(
		defMatchPart: Part,
		fromPart: Part,
		contextMatchParts: readonly Part[] = []
	): Promise<Location[]> {
		await this.beFresh()
		return this.findReferencesFromServices([...this.walkAvailableServices()], defMatchPart, fromPart, contextMatchParts)
	}

	/** Collect raw reference matches across services, choose globally, then build locations. */
	findReferencesFromServices(
		services: readonly BaseService[],
		defMatchPart: Part,
		fromPart: Part,
		contextMatchParts: readonly Part[] = []
	): Location[] {
		let normal: {service: BaseService, part: Part}[] = []
		let contextual: {service: BaseService, part: Part}[] = []

		for (let service of services) {
			let matches = service.findReferenceMatchParts(defMatchPart, fromPart, contextMatchParts)
			normal.push(...matches.normal.map(part => ({service, part})))
			contextual.push(...matches.contextual.map(part => ({service, part})))
		}

		return (contextual.length > 0 ? contextual : normal).map(({service, part}) => {
			return PartConvertor.toLocation(part, service.document)
		})
	}

	async findHover(
		matchPart: Part,
		fromPart: Part,
		fromDocument: TextDocument,
		maxStylePropertyCount: number,
		contextMatchParts: readonly Part[] = []
	): Promise<Hover | null> {
		await this.beFresh()
		return this.findHoverFromServices([...this.walkAvailableServices()], matchPart, fromPart, fromDocument, maxStylePropertyCount, contextMatchParts)
	}

	/** Collect definition matches globally, prefer contextual ones, then build Quick Info. */
	findHoverFromServices(
		services: readonly BaseService[],
		matchPart: Part,
		fromPart: Part,
		fromDocument: TextDocument,
		maxStylePropertyCount: number,
		contextMatchParts: readonly Part[] = []
	): Hover | null {
		let normal: {service: BaseService, part: Part}[] = []
		let contextual: {service: BaseService, part: Part}[] = []

		for (let service of services) {
			let matches = service.findDefinitionMatchParts(matchPart, contextMatchParts)
			normal.push(...matches.normal.map(part => ({service, part})))
			contextual.push(...matches.contextual.map(part => ({service, part})))
		}

		let matches = contextual.length > 0 ? contextual : normal
		let match = matches.find(({part}) => part.isSelectorDetailedType() && part.independent) ?? matches[0]

		return match?.service.makeHover(match.part, fromPart, fromDocument, maxStylePropertyCount) ?? null
	}

	/** Find all css variable values. */
	async getCSSVariables(names: Set<string>): Promise<Map<string, string>> {
		await this.beFresh()

		let map: Map<string, string> = new Map()

		for (let service of this.walkAvailableServices()) {
			for (const [name, value] of service.getCSSVariables(names)) {
				map.set(name, value)
			}
		}

		return map
	}
}
