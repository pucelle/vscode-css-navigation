import {SymbolInformation, LocationLink, Location, Hover} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {PathResolver} from '../resolver'
import {Part, PartConvertor, PartType, CSSSelectorPart, PartComparer} from '../parts'
import {quickBinaryFind, quickBinaryFindIndex} from '../utils'


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

			// Must have no protocol.
			if (/^\w+:/.test(part.text)) {
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
	 * Note if match a css selector part, it may return a selector detail part.
	 */
	findDetailedPartAt(offset: number): Part | undefined {
		let part = this.findPartAt(offset)

		// Returns detail if in range.
		if (part && part.type === PartType.CSSSelector) {
			let detailed = (part as CSSSelectorPart).details

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
	 * Find previous sibling part before current.
	 * Not it will not look up detailed parts.
	 */
	findPreviousPart(part: Part): Part | null {
		let partIndex = quickBinaryFindIndex(this.parts, p => {
			return p.start - part.start
		})

		if (partIndex <= 0) {
			return null
		}

		return this.parts[partIndex - 1]
	}

	/** 
	 * Find definitions match part.
	 * `matchDefPart` must have been converted to definition type.
	 */
	findDefinitions(matchDefPart: Part, fromPart: Part, fromDocument: TextDocument): LocationLink[] {
		let locations: LocationLink[] = []

		for (let part of this.parts) {
			let mayPrimary = PartComparer.mayPrimary(part)
			if (!mayPrimary) {
				continue
			}

			if (!PartComparer.isTypeMatch(mayPrimary, matchDefPart)) {
				continue
			}

			if (!PartComparer.isMayFormattedListMatch(mayPrimary, matchDefPart)) {
				continue
			}

			// `.a{&:hover}`, `&` not match `.a` because it reference parent totally.
			if (part.type === PartType.CSSSelector
				&& mayPrimary.text === '&'
			) {
				continue
			}

			locations.push(PartConvertor.toLocationLink(mayPrimary, this.document, fromPart, fromDocument))
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

			// Match text list with regexp.
			if (!PartComparer.isMayFormattedListExpMatch(part, re)) {
				continue
			}

			symbols.push(...PartConvertor.toSymbolInformationList(part, this.document))
		}

		return symbols
	}
	
	/** 
	 * Get completion labels match part.
	 * `matchDefPart` must have been converted to definition type.
	 */
	getCompletionLabels(matchPart: Part, fromPart: Part): string[] {
		let labelSet: Set<string> = new Set()
		let re = PartConvertor.makeStartsMatchExp(matchPart.text)

		for (let part of this.parts) {

			// Completion use primary selector.
			let mayPrimary = PartComparer.mayPrimary(part)
			if (!mayPrimary) {
				continue
			}

			if (!PartComparer.isTypeMatch(mayPrimary, matchPart)) {
				continue
			}

			if (!PartComparer.isMayFormattedListExpMatch(mayPrimary, re)) {
				continue
			}

			// Convert text from current type to original type.
			for (let text of PartComparer.mayFormatted(mayPrimary)) {
				labelSet.add(PartConvertor.textToType(text, matchPart.type, fromPart.type))
			}
		}

		// Removes match part itself.
		labelSet.delete(matchPart.text)

		return [...labelSet.values()]
	}

	/** 
	 * Get completion labels match part.
	 * The difference with `getCompletionLabels` is that
	 * `fromPart` is a definition part like class name selector,
	 * but current parts are reference types of parts.
	 */
	getReferencedCompletionLabels(fromPart: Part): string[] {
		let labelSet: Set<string> = new Set()
		let re = PartConvertor.makeIdentifiedStartsMatchExp(PartComparer.mayFormatted(fromPart), fromPart.type)
		let definitionPart = PartConvertor.toDefinitionMode(fromPart)

		for (let part of this.parts) {
			for (let detail of PartComparer.mayDetails(part)) {
				if (!PartComparer.isReferenceTypeMatch(detail, definitionPart)) {
					continue
				}

				if (!PartComparer.isMayFormattedListExpMatch(detail, re)) {
					continue
				}

				for (let text of PartComparer.mayFormatted(part)) {

					// Replace back from `a-b` to `&-b`.
					labelSet.add(PartConvertor.textToType(text, part.type, fromPart.type).replace(re, fromPart.text))
				}
			}
		}

		// Removes match part itself.
		labelSet.delete(fromPart.text)

		return [...labelSet.values()]
	}

	/** 
	 * Find the reference locations in the HTML document from a class or id selector.
	 * `matchDefPart` must have been converted to definition type.
	 */
	findReferences(matchDefPart: Part, fromPart: Part): Location[] {
		let locations: Location[] = []

		// Important, use may formatted text, and also must use definition text.
		let texts = fromPart.hasFormattedList() ? PartComparer.mayFormatted(fromPart) : [matchDefPart.text]

		for (let part of this.parts) {
			for (let detail of PartComparer.mayDetails(part)) {
				if (!PartComparer.isReferenceTypeMatch(detail, matchDefPart)) {
					continue
				}

				if (!PartComparer.isReferenceTextMatch(detail, matchDefPart.type, texts)) {
					continue
				}

				locations.push(PartConvertor.toLocation(detail, this.document))
			}
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
