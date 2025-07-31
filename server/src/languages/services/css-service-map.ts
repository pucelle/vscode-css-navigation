import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService} from './css-service'
import {BaseServiceMap} from './base-service-map'


/** Gives CSS service for multiple files. */
export class CSSServiceMap extends BaseServiceMap<CSSService> {

	protected identifier = 'css'

	/** Class name set to contains all the class names of whole service. */
	protected definedClassNamesSet: Set<string> = new Set()

	protected onAfterUpdated() {

		// Make class name set.
		if (this.config.enableClassNameDefinitionDiagnostic) {
			this.definedClassNamesSet.clear()

			for (let service of this.walkAvailableServices()) {
				for (let className of service.getDefinedClassNamesSet()) {
					this.definedClassNamesSet.add(className)
				}
			}
		}
	}

	/** Test whether defined class name existing. */
	hasDefinedClassName(className: string): boolean {
		return this.definedClassNamesSet.has(className)
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

		// If having `@import ...`, load it.
		let importURIs = await cssService.getImportedCSSURIs()

		for (let importURI of importURIs) {
			this.mayTrackMoreURI(importURI)
		}

		this.trackingMap.addImported(importURIs, uri)
	}
}
