import {SymbolInformation, LocationLink, Location, CompletionItem, Hover} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {PathResolver} from '../resolver'
import {Part, PartConvertor, PartType} from '../trees'
import {quickBinaryFind, quickBinaryFindIndex} from '../utils'
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

	/** Find a part at specified offset. */
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

		return part
	}

	/** 
	 * Find a part at specified offset.
	 * Note it may return a selector primary part,
	 * and returns css selector part if no primary or primary not match.
	 */
	findMayPrimaryPartAt(offset: number) {
		let part = this.findPartAt(offset)

		// Returns detail if in range.
		if (part && part.type === PartType.CSSSelector) {
			let detail = (part as CSSSelectorPart).primary
			if (detail
				&& detail.start <= offset
				&& detail.end >= offset
			) {
				return detail
			}
		}

		return part
	}

	/** 
	 * Find a part at specified offset.
	 * Note if match a css selector part, it may return a selector detail part.
	 */
	findDetailedPartAt(offset: number) {
		let part = this.findPartAt(offset)

		// Returns detail if in range.
		if (part && part.type === PartType.CSSSelector) {
			let detailed = (part as CSSSelectorPart).detailed

			for (let detail of detailed) {
				if (detail
					&& detail.start <= offset
					&& detail.end >= offset
				) {
					return detail
				}
			}

			return undefined
		}

		return part
	}

	/** 
	 * Find part before.
	 * Not it will not look up detailed parts.
	 */
	findPreviousPart(part: Part) {
		let partIndex = quickBinaryFindIndex(this.parts, p => {
			return p.start - part.start
		})

		if (partIndex <= 0) {
			return null
		}

		return this.parts[partIndex - 1]
	}

	/** Find definitions match part. */
	findDefinitions(matchPart: Part, fromPart: Part, fromDocument: TextDocument): LocationLink[] {
		let locations: LocationLink[] = []

		for (let part of this.parts) {
			if (!part.isMayPrimaryMatch(matchPart)) {
				continue
			}

			// `.a{&:hover}`, `&` not match `.a` because it reference parent totally.
			if (part.type === PartType.CSSSelector
				&& (part as CSSSelectorPart).primary!.text === '&'
			) {
				continue
			}

			locations.push(PartConvertor.mayPrimaryToLocationLink(part, this.document, fromPart, fromDocument))
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
		let re = PartConvertor.makeWordStartsMatchExp(query)

		for (let part of this.parts) {
			if (!part.isTextExpMatch(re)) {
				continue
			}

			symbols.push(...PartConvertor.toSymbolInformationList(part, this.document))
		}

		return symbols
	}
	
	/** Get completion labels match part. */
	getCompletionLabels(matchPart: Part, fromPart: Part): string[] {
		let labelSet: Set<string> = new Set()
		let re = PartConvertor.makeStartsMatchExp(matchPart.text)

		for (let part of this.parts) {
			if (!part.isMayPrimaryTypeMatch(matchPart)) {
				continue
			}

			if (!part.isMayPrimaryTextExpMatch(re)) {
				continue
			}

			// Convert text from current type to original type.
			for (let text of part.mayPrimaryTextList) {
				labelSet.add(PartConvertor.textToType(text, matchPart.type, fromPart.type))
			}
		}

		// Removes match part itself.
		labelSet.delete(matchPart.text)

		return [...labelSet.values()]
	}

	/** Get completion items match part. */
	getCompletionItems(matchPart: Part, fromPart: Part, fromDocument: TextDocument): CompletionItem[] {
		let labels = this.getCompletionLabels(matchPart, fromPart)
		return PartConvertor.toCompletionItems(fromPart, labels, fromDocument)
	}

	/** Find the reference locations in the HTML document from a class or id selector. */
	findReferences(fromPart: Part): Location[] {
		let locations: Location[] = []

		for (let part of this.parts) {
			if (!part.isMatchAsReference(fromPart)) {
				continue
			}

			locations.push(PartConvertor.toLocation(part, this.document))
		}

		return locations
	}
	
	/** Find hover from CSS document for providing class or id name hover for a HTML document. */
	findHover(matchPart: Part, fromDocument: TextDocument, maxStylePropertyCount: number): Hover | null {
		for (let part of this.parts) {
			if (part.type !== PartType.CSSSelector) {
				continue
			}

			let primary = (part as CSSSelectorPart).primary

			if (!primary
				|| !primary.independent
				|| !primary.isMatch(matchPart)
			) {
				continue
			}
	
			return PartConvertor.toHover(part as CSSSelectorPart, matchPart, this.document, fromDocument, maxStylePropertyCount)
		}

		return null
	}
}
