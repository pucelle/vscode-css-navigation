import {HTMLService} from './html-service'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {BaseServiceMap} from './base-service-map'


export class HTMLServiceMap extends BaseServiceMap<HTMLService> {

	protected identifier = 'html'

	/** Class name set to contains all the defined class names of whole service. */
	protected definedClassNamesSet: Set<string> = new Set()

	/** Class name set to contains all the referenced class names of whole service. */
	protected referencedClassNamesSet: Set<string> = new Set()

	protected onAfterUpdated() {

		// Make definition class name set.
		if (this.config.enableClassNameDefinitionDiagnostic
			&& this.config.enableSharedCSSFragments
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
}
