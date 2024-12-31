import {SymbolInformation, LocationLink, Location, CompletionItem, Hover} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {PathResolver} from '../resolver'
import {Part, PartType} from '../trees'
import {quickBinaryFind} from '../utils'
import {CSSSelectorPart} from '../trees'


/** Base of HTML or CSS service for one file. */
export abstract class BaseService {

	readonly document: TextDocument
	protected parts!: Part[]
	protected resolvedImportedCSSPaths: string[] | undefined = undefined

	constructor(document: TextDocument) {
		this.document = document
	}

	/** Get resolved import CSS file paths. */
	async getImportedCSSPaths(): Promise<string[]> {

		// How low rate to resolving for twice, no matter.
		if (this.resolvedImportedCSSPaths) {
			return this.resolvedImportedCSSPaths
		}

		let paths: string[] = []

		for (let part of this.parts) {
			if (part.type !== PartType.CSSImportPath) {
				continue
			}

			// Must be a relative path.
			if (!part.text.startsWith('.')) {
				continue
			}

			let path = await PathResolver.resolveDocumentPath(part.text, this.document)
			if (path) {
				paths.push(path)
			}
		}

		return this.resolvedImportedCSSPaths = paths
	}

	/** 
	 * Find a part at specified offset.
	 * Note it may return a selector detail part.
	 */
	findPartAt(offset: number) {
		let part = quickBinaryFind(this.parts, (part) => {
			if (part.start > offset) {
				return 1
			}
			else if (part.end < offset) {
				return -1
			}
			else {
				return 0
			}
		})

		// Returns detail if in range.
		if (part && part.type === PartType.CSSSelector) {
			let detail = (part as CSSSelectorPart).detail
			if (detail
				&& detail.start <= offset
				&& detail.end >= offset
			) {
				return detail
			}
		}

		return part
	}

	/** Find definitions match part. */
	findDefinitions(matchPart: Part, fromPart: Part, fromDocument: TextDocument): LocationLink[] {
		let locations: LocationLink[] = []

		for (let part of this.parts) {
			if (!part.isMatch(matchPart)) {
				continue
			}

			locations.push(part.toLocationLink(this.document, fromPart, fromDocument))
		}

		return locations
	}

	/**
	 * Query symbols from a wild match part.
     *
	 * Query string 'p' will match:
	 *	p* as tag name
	 *	.p* as class name
	 *	#p* as id
	 * and may have more decorated selectors followed.
	 */
	findSymbols(query: string): SymbolInformation[] {
		let symbols: SymbolInformation[] = []
		let re = Part.makeWordStartsMatchExp(query)

		for (let part of this.parts) {
			if (!part.isTextExpMatch(re)) {
				continue
			}

			symbols.push(...part.toSymbolInformationList(this.document))
		}

		return symbols
	}
	
	/** Get completion labels match part. */
	getCompletionLabels(matchPart: Part): string[] {
		let labelSet: Set<string> = new Set()
		let re = Part.makeStartsMatchExp(matchPart.text)

		for (let part of this.parts) {
			if (part.type !== matchPart.type) {
				continue
			}

			if (!part.isTextExpMatch(re)) {
				continue
			}

			for (let text of part.textList) {
				labelSet.add(text)
			}
		}

		// Removes match part itself.
		labelSet.delete(matchPart.text)

		return [...labelSet.values()]
	}

	/** Get completion items match part. */
	getCompletionItems(matchPart: Part, fromPart: Part, fromDocument: TextDocument): CompletionItem[] {
		let labels = this.getCompletionLabels(matchPart)
		return fromPart.toCompletionItems(labels, fromDocument)
	}

	/** Find the reference locations in the HTML document from a class or id selector. */
	findReferences(fromPart: Part): Location[] {
		let locations: Location[] = []

		for (let part of this.parts) {
			if (!part.isMatchAsReference(fromPart)) {
				continue
			}

			locations.push(part.toLocation(this.document))
		}

		return locations
	}
	
	/** Find parts from CSS document for providing class or id name hover for a HTML document. */
	findHoverParts(matchPart: Part): CSSSelectorPart[] {
		let parts: CSSSelectorPart[] = []

		for (let part of this.parts) {
			if (!part.isMatch(matchPart)
				|| part.type !== PartType.CSSSelector
			) {
				continue
			}

			parts.push(part as CSSSelectorPart)
		}

		return parts
	}

	findHover(matchPart: Part, fromPart: Part, fromDocument: TextDocument): Hover | null {
		let parts = this.findHoverParts(matchPart)
		if (parts.length === 0) {
			return null
		}

		let commentedParts = parts.filter(p => p.comment)
		let part = commentedParts.find(part => part.detail!.independent) ?? commentedParts[0]

		return fromPart.toHover(part?.comment!, fromDocument)
	}
}
