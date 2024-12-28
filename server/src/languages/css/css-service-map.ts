import * as path from 'path'
import {SymbolInformation, TextDocuments, LocationLink, CompletionItem, Hover} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {FileTrackerOptions, FileTracker, replacePathExtension} from '../../helpers'
import {CSSService} from './css-service'
import {CSSSelectorPart, Part} from '../trees'


export interface CSSServiceMapOptions extends FileTrackerOptions {

	/** Whether always include files specified by `@import ...` */
	includeImportedFiles: boolean

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

	/** Get CSS service by uri. */
	async get(uri: string): Promise<CSSService | undefined> {
		await this.makeFresh()
		return this.serviceMap.get(uri)
	}

	protected onFileTracked(uri: string) {

		// If same name scss or less files exist, ignore css files.
		if (this.ignoreSameNameCSSFile) {
			let ext = path.extname(uri).slice(1).toLowerCase()
			if (ext === 'css') {
				let sassOrLessExist = this.has(replacePathExtension(uri, 'scss'))
					|| this.has(replacePathExtension(uri, 'less'))
					|| this.has(replacePathExtension(uri, 'sass'))

				if (sassOrLessExist) {
					this.ignore(uri)
				}
			}
			else {
				let cssPath = replacePathExtension(uri, 'css')
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
				let cssPath = replacePathExtension(uri, 'css')
				if (this.has(cssPath)) {
					this.notIgnore(cssPath)
				}
			}
		}
	}

	/** Parse document to CSS service. */
	protected async parseDocument(uri: string, document: TextDocument) {
		let cssService = new CSSService(document)
		this.serviceMap.set(uri, cssService)

		// If having `@import ...`, load it.
		let importPaths = cssService.resolvedImportPaths()
		for await (let importPath of importPaths) {
			this.trackMoreFile(importPath)
		}
	}

	async findDefinitions(fromPart: Part, fromDocument: TextDocument): Promise<LocationLink[]> {
		await this.makeFresh()

		let fromRange = fromPart.toRange(fromDocument)
		let matchPart = fromPart.toCSS()
		let locations: LocationLink[] = []

		for (let cssService of this.walkAvailableCSSServices()) {
			locations.push(...cssService.findDefinitions(matchPart, fromRange))
		}

		return locations
	}
	
	async findSymbols(query: string): Promise<SymbolInformation[]> {
		await this.makeFresh()

		let symbols: SymbolInformation[] = []

		for (let cssService of this.walkAvailableCSSServices()) {
			symbols.push(...cssService.findSymbols(query))
		}

		return symbols
	}

	async findCompletionItems(fromPart: Part, fromDocument: TextDocument): Promise<CompletionItem[]> {
		await this.makeFresh()

		let matchPart = fromPart.toCSS()
		let labelSet: Set<string> = new Set()

		for (let cssService of this.walkAvailableCSSServices()) {
			for (let label of cssService.findCompletionLabels(matchPart)) {
				labelSet.add(label)
			}
		}

		return fromPart.toCompletionItems([...labelSet.values()], fromDocument)
	}

	async findHover(fromPart: Part, fromDocument: TextDocument): Promise<Hover | undefined> {
		await this.makeFresh()

		let matchPart = fromPart.toCSS()
		let parts: CSSSelectorPart[] = []

		for (let cssService of this.walkAvailableCSSServices()) {
			parts.push(...cssService.findHoverParts(matchPart))
		}

		if (parts.length === 0) {
			return undefined
		}

		let commentedParts = parts.filter(p => p.comment)
		let part = commentedParts.find(part => part.detail!.independent) ?? commentedParts[0]

		return fromPart.toHover(part?.comment!, fromDocument)
	}
	
	private *walkAvailableCSSServices(): IterableIterator<CSSService> {
		for (let [uri, cssService] of this.serviceMap.entries()) {
			if (!this.hasIgnored(uri)) {
				yield cssService
			}
		}
	}
}
