import {HTMLService} from './html-service'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {BaseServiceMap} from './base-service-map'
import {TwoWayListMap} from '../../utils'
import {TrackingReasonMask} from '../../core'
import {CSSServiceMap} from './css-service-map'


export class HTMLServiceMap extends BaseServiceMap<HTMLService> {

	protected identifier = 'html'
	protected cssServiceMap!: CSSServiceMap

	/** Class name set to contains all the defined class names of whole service. */
	protected definedClassNamesSet: Set<string> = new Set()

	/** Class name set to contains all the referenced class names of whole service. */
	protected referencedClassNamesSet: Set<string> = new Set()

	/** URI <-> CSS Imported URI. */
	private cssImportMap: TwoWayListMap<string, string> = new TwoWayListMap()

	bindCSSServiceMap(cssServiceMap: CSSServiceMap) {
		this.cssServiceMap = cssServiceMap
	}

	protected untrackURI(uri: string) {
		super.untrackURI(uri)

		if (this.config.enableGlobalEmbeddedCSS) {
			let oldImportURIs = this.cssImportMap.getByLeft(uri)
			this.cssImportMap.deleteLeft(uri)

			if (oldImportURIs) {
				this.checkImportURIsImported(oldImportURIs)
			}
		}
	}

	private checkImportURIsImported(importURIs: string[]) {
		for (let importURI of importURIs) {

			// Have no import to it from any html file.
			if (this.cssImportMap.countOfRight(importURI) === 0) {
				this.cssServiceMap.trackingMap.removeReason(importURI, TrackingReasonMask.ForceImported)
			}
		}
	}

	protected onReleaseResources() {
		super.onReleaseResources()
		this.cssImportMap.clear()
	}

	protected onAfterUpdated() {

		// Make definition class name set.
		if (this.config.enableClassNameDefinitionDiagnostic
			&& this.config.enableGlobalEmbeddedCSS
		) {
			this.definedClassNamesSet.clear()
			
			for (let service of this.walkAvailableServices()) {
				for (let className of service.getDefinedClassNamesSet()) {
					this.definedClassNamesSet.add(className)
				}
			}
		}

		if (this.config.enableClassNameReferenceDiagnostic) {
			this.referencedClassNamesSet.clear()

			for (let service of this.walkAvailableServices()) {
				for (let className of service.getReferencedClassNamesSet()) {
					this.referencedClassNamesSet.add(className)
				}
			}
		}
	}

	/** Test whether defined class name existing. */
	hasDefinedClassName(className: string): boolean {
		return this.definedClassNamesSet.has(className)
	}

	/** Test whether referenced class name existing. */
	hasReferencedClassName(className: string): boolean {
		return this.referencedClassNamesSet.has(className)
	}
	
	protected createService(document: TextDocument) {
		return new HTMLService(document, this.config)
	}

	/** Parse document to HTML service, and analyze imported. */
	protected async parseDocument(uri: string, document: TextDocument) {
		await super.parseDocument(uri, document)

		if (this.config.enableGlobalEmbeddedCSS) {
			let htmlService = this.serviceMap.get(uri)
			if (!htmlService) {
				return
			}

			let oldImportURIs = this.cssImportMap.getByLeft(uri)

			// If having `@import ...`, load it.
			let importURIs = await htmlService.getImportedCSSURIs()

			// Force import css uris.
			for (let importURI of importURIs) {
				this.cssServiceMap.trackMoreURI(importURI, TrackingReasonMask.ForceImported)
			}

			this.cssImportMap.replaceLeft(uri, importURIs)

			if (oldImportURIs) {
				this.checkImportURIsImported(oldImportURIs)
			}
		}
	}
}
