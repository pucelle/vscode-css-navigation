import {SymbolInformation, LocationLink, Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {PathResolver} from '../resolver'
import {CSSTokenTree, Part, PartType} from '../trees'
import {quickBinaryFind} from '../utils'
import {CSSSelectorPart} from '../trees'


/** Gives CSS service for one CSS file. */
export class CSSService {

	readonly document: TextDocument
	private parts: Part[]

	constructor(document: TextDocument) {
		this.document = document
		this.parts = [...CSSTokenTree.fromString(document.getText(), document.languageId as CSSLanguageId).walkParts()]
	}

	/** Get resolved import file paths specified by `@import ...`. */
	async *resolvedImportPaths(): AsyncIterable<string> {
		for (let part of this.parts) {
			if (part.type !== PartType.ImportPath) {
				continue
			}

			// Must be a relative path.
			if (!part.text.startsWith('.')) {
				continue
			}

			let path = await PathResolver.resolveDocumentPath(part.text, this.document)
			if (path) {
				yield path
			}
		}
	}

	/** 
	 * Find a part at specified offset.
	 * Note it may return a selector detail part.
	 */
	findPartAt(offset: number) {
		let part = quickBinaryFind(this.parts, (part) => {
			if (part.start > offset) {
				return -1
			}
			else if (part.end < offset) {
				return 1
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
	findDefinitions(matchPart: Part, fromRange: Range): LocationLink[] {
		let locations: LocationLink[] = []

		for (let part of this.parts) {
			if (!part.isMatch(matchPart)) {
				continue
			}

			locations.push(part.toLocationLink(this.document, fromRange))
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
			if (!part.isExpMatch(re)) {
				continue
			}

			symbols.push(...part.toSymbolInformationList(this.document))
		}

		return symbols
	}
	
	/** Find completion labels match part. */
	findCompletionLabels(matchPart: Part): string[] {
		let labelSet: Set<string> = new Set()
		let re = Part.makeStartsMatchExp(matchPart.text)

		for (let part of this.parts) {
			if (part.type !== matchPart.type) {
				continue
			}

			if (!part.isExpMatch(re)) {
				continue
			}

			for (let text of part.textList) {
				labelSet.add(text)
			}
		}

		return [...labelSet.values()]
	}

	/** Find parts for providing hover service. */
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
}
