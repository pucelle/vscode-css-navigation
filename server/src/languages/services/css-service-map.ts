import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService} from './css-service'
import {BaseServiceMap} from './base-service-map'
import {URI} from 'vscode-uri'
import {TwoWaySetMap} from '../../utils'


/** Gives CSS service for multiple files. */
export class CSSServiceMap extends BaseServiceMap<CSSService> {

	/** Class name <-> File URI, to dynamic update by a uri. */
	protected classNamesMap: TwoWaySetMap<string, string> = new TwoWaySetMap()

	protected onFileExpired(uri: string) {
		super.onFileExpired(uri)

		if (this.config.enableClassNameDiagnostic) {
			this.deleteClassNamesOfURI(uri)
		}
	}

	protected onFileUntracked(uri: string) {
		super.onFileUntracked(uri)

		if (this.config.enableClassNameDiagnostic) {
			this.deleteClassNamesOfURI(uri)
		}
	}

	protected onReleaseResources() {
		super.onReleaseResources()

		if (this.config.enableClassNameDiagnostic) {
			this.classNamesMap.clear()
		}
	}

	protected deleteClassNamesOfURI(uri: string) {
		this.classNamesMap.deleteRight(uri)
	}

	protected addClassNamesOfService(uri: string, service: CSSService) {
		let classNamesSet = service.getClassNamesSet()
		this.classNamesMap.replaceRight(uri, classNamesSet)
	}

	/** 
	 * Test whether class name existing.
	 * `className` must have identifier `.`.
	 */
	async hasClassName(className: string): Promise<boolean> {
		await this.beFresh()
		return this.classNamesMap.hasLeft(className)
	}

	protected createService(document: TextDocument) {
		return new CSSService(document, this.config)
	}

	/** Parse document to CSS service, and analyze imported. */
	protected async parseDocument(uri: string, document: TextDocument) {
		await super.parseDocument(uri, document)

		let cssService = this.serviceMap.get(uri)
		if (!cssService) {
			return
		}

		if (this.config.enableClassNameDiagnostic) {
			this.addClassNamesOfService(uri, cssService)
		}

		// If having `@import ...`, load it.
		let importPaths = await cssService.getImportedCSSPaths()
		let importedURIs = importPaths.map(path => URI.file(path).toString())

		for (let importPath of importPaths) {
			this.trackMoreFile(importPath)
		}

		this.trackingMap.addImported(importedURIs, uri)
	}
}
