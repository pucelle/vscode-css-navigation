import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSService} from './css-service'
import {BaseServiceMap} from './base-service-map'
import {getPathExtension, replacePathExtension} from '../../utils'


const SameNameSourceExtensions = ['scss', 'sass', 'less']


/** Whether a generated CSS URI has an active same-name preprocessor source. */
export function shouldIgnoreSameNameCSSURI(uri: string, activeURIs: ReadonlySet<string>): boolean {
	if (getPathExtension(uri) !== 'css') {
		return false
	}

	return SameNameSourceExtensions.some(extension => activeURIs.has(replacePathExtension(uri, extension)))
}


/** Gives CSS service for multiple files. */
export class CSSServiceMap extends BaseServiceMap<CSSService> {

	protected identifier = 'css'

	/** Class map to contains all the class names and their count of whole service. */
	protected definedClassNamesSet: Map<string, number> = new Map()

	protected override *walkAvailableServices(): IterableIterator<CSSService> {
		let activeURIs = new Set(this.trackingMap.walkActiveURIs())

		for (let uri of activeURIs) {
			if (this.config.ignoreSameNameCSSFile && shouldIgnoreSameNameCSSURI(uri, activeURIs)) {
				continue
			}

			let service = this.serviceMap.get(uri)
			if (service) {
				this.trackingMap.setUseTime(uri, this.timestamp)
				yield service
			}
		}
	}

	protected override onAfterUpdated() {

		// Make class name set.
		this.definedClassNamesSet.clear()

		for (let service of this.walkAvailableServices()) {
			for (const [className, count] of service.getDefinedClassNames()) {
				this.definedClassNamesSet.set(className, (this.definedClassNamesSet.get(className) ?? 0) + count)
			}
		}
	}

	/** Test whether defined class name existing. */
	hasDefinedClassName(className: string): boolean {
		return this.definedClassNamesSet.has(className)
	}

	/** Get defined class name count. */
	getDefinedClassNameCount(className: string): number {
		return this.definedClassNamesSet.get(className) ?? 0
	}

	protected createService(document: TextDocument) {
		return new CSSService(document, this.config)
	}

	/** Parse document to CSS service, and analyze imported. */
	protected override async parseDocument(uri: string, document: TextDocument) {
		await super.parseDocument(uri, document)

		let cssService = this.serviceMap.get(uri)
		if (!cssService) {
			return
		}

		// If having `@import ...`, load it.
		let importURIs = await cssService.getImportedCSSURIs()

		for (let importURI of importURIs) {
			this.trackMoreURI(importURI)
		}

		this.trackingMap.setImported(importURIs, uri)
	}
}
