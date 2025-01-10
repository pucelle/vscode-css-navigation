import {TextDocument} from 'vscode-languageserver-textdocument'
import {FileTrackerOptions} from '../../core'
import {CSSService} from './css-service'
import {BaseServiceMap} from './base-service-map'
import {URI} from 'vscode-uri'


export interface CSSServiceMapOptions extends FileTrackerOptions {

	/** Whether ignore css when same name scss files exists. */
	ignoreSameNameCSSFile: boolean
}


/** Gives CSS service for multiple files. */
export class CSSServiceMap extends BaseServiceMap<CSSService> {

	protected createService(document: TextDocument) {
		return new CSSService(document)
	}

	/** Parse document to CSS service, and analyze imported. */
	protected async parseDocument(uri: string, document: TextDocument) {
		super.parseDocument(uri, document)

		let cssService = this.serviceMap.get(uri)!

		// If having `@import ...`, load it.
		let importPaths = await cssService.getImportedCSSPaths()
		let importedURIs = importPaths.map(path => URI.file(path).toString())

		for (let importPath of importPaths) {
			this.trackMoreFile(importPath)
		}

		this.trackingMap.addImported(importedURIs, uri)
	}
}
