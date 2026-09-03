import {SymbolInformation, Hover} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {PathResolver} from '../resolver'
import {Part, PartConvertor, PartType, CSSSelectorWrapperPart, PartComparer, CSSVariableDefinitionPart} from '../parts'
import {groupBy, quickBinaryFindUpper, quickBinaryFindIndex} from '../utils'
import {URI} from 'vscode-uri'
import {CompletionLabel} from './types'
import {CSSSelectorDetailedPart} from '../parts/part-css-selector-detailed'
import {isRelativePath} from '../../utils'


/** A definition or reference search result. */
export interface PartMatchResult {
	normal: Part[]
	contextual: Part[]
}


/** Base of HTML or CSS service for one file. */
export abstract class BaseService {

	readonly document: TextDocument
	readonly config: Configuration

	/** Already sort by token index. */
	protected parts: Part[]

	/** Contains primary selector part, bot not all details. */
	protected partMap: Map<PartType, Part[]>

	/** URIs of imported css. */
	protected resolvedImportedCSSURIs: string[] | undefined = undefined

	/** All class names for diagnostic, names excluded identifier `.`. */
	protected definedClassNames: Map<string, number> = new Map()

	constructor(document: TextDocument, config: Configuration) {
		this.document = document
		this.config = config
		
		let tree = this.makeTree()
		this.parts = [...tree.walkParts()]
		this.partMap = groupBy(this.parts, part => [part.type, part])

		this.initAdditionalParts()
		this.initDefinedClassNames()
	}

	protected initAdditionalParts() {
		let selectorParts = this.partMap.get(PartType.CSSSelectorWrapper) as CSSSelectorWrapperPart[] | undefined
		if (!selectorParts) {
			return
		}

		// Distinguish selector details.
		this.partMap.set(PartType.CSSSelectorTag, [])
		this.partMap.set(PartType.CSSSelectorClass, [])
		this.partMap.set(PartType.CSSSelectorId, [])

		for (let part of selectorParts) {
			for (let detail of part.details) {
				this.partMap.get(detail.type)!.push(detail)
			}
		}
	}

	protected initDefinedClassNames() {
		let classSelectorParts = this.partMap.get(PartType.CSSSelectorClass) as CSSSelectorDetailedPart[] | undefined
		if (classSelectorParts) {
			for (let part of classSelectorParts) {
				if (part.escapedText === '&') {
					continue
				}
				
				for (let formatted of part.formatted) {
					let className = formatted.slice(1)
					this.definedClassNames.set(className, (this.definedClassNames.get(className) ?? 0) + 1)
				}
			}
		}
	}

	protected abstract makeTree(): {walkParts(): Iterable<Part>}

	/** Get part list by part type. */
	getPartsByType(type: PartType): Part[] {
		return this.partMap.get(type) || []
	}

	/** Get resolved import CSS uris. */
	async getImportedCSSURIs(): Promise<string[]> {

		// Have low rate to resolving for twice, no matter.
		if (this.resolvedImportedCSSURIs) {
			return this.resolvedImportedCSSURIs
		}

		let uris: string[] = []

		for (let part of this.getPartsByType(PartType.CSSImportPath)) {
			let protocol = isRelativePath(part.escapedText) ? '' : URI.parse(part.escapedText).scheme

			// Relative path, or file, http or https.
			if (protocol !== '' && protocol !== 'file' && protocol !== 'http' && protocol !== 'https') {
				continue
			}

			let uri = await PathResolver.resolveImportURI(part.escapedText, this.document)
			if (uri) {
				uris.push(uri)
			}
		}

		return this.resolvedImportedCSSURIs = uris
	}

	/** Get defined class names as a set. */
	getDefinedClassNames(): Map<string, number> {
		return this.definedClassNames
	}

	/** Test whether defined class name existing. */
	hasDefinedClassName(className: string): boolean {
		return this.definedClassNames.has(className)
	}

	/** Test count of defined class name. */
	getDefinedClassNameCount(className: string): number {
		return this.definedClassNames.get(className) ?? 0
	}

	/** 
	 * Find a part at specified offset.
	 * Note it never get detailed part.
	 */
	findPartAt(offset: number) {
		let part = quickBinaryFindUpper(this.parts, (part) => {
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
		if (part && part.type === PartType.CSSSelectorWrapper) {
			let details = (part as CSSSelectorWrapperPart).details

			for (let detail of details) {
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
	 * Find definitions match parts.
	 * `defMatchPart` must have been converted to definition type.
	 */
	findDefinitionMatchParts(defMatchPart: Part, contextDefMatchParts: readonly Part[] = []): PartMatchResult {
		let result: PartMatchResult = {normal: [], contextual: []}

		for (let part of this.getPartsByType(defMatchPart.type)) {
			if (!PartComparer.isMayFormattedListMatch(part, defMatchPart)) {
				continue
			}

			if (part.isSelectorDetailedType() && !part.primary) {
				continue
			}

			// `.a{&:hover}`, `&` not match `.a` because it reference parent completely.
			if (part.escapedText === '&') {
				continue
			}

			result.normal.push(part)

			// Contextual match results.
			if (contextDefMatchParts.length > 0
				&& this.isDefMatchPartsSubset(this.getContextualDefMatchParts(part), contextDefMatchParts)
			) {
				result.contextual.push(part)
			}
		}

		return result
	}

	/** Check whether two definition type contextual parts list match. */
	private isDefMatchPartsSubset(defRequired: readonly Part[], defAvailable: readonly Part[]): boolean {
		if (defRequired.length === 0) {
			return false
		}

		for (let requiredPart of defRequired) {
			let requiredTexts = PartComparer.mayFormatted(requiredPart)

			let matched = defAvailable.some(availablePart => {
				return availablePart.type === requiredPart.type
					&& PartComparer.isReferenceTextMatch(availablePart, requiredPart.type, requiredTexts)
			})

			if (!matched) {
				return false
			}
		}

		return true
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

			// Match text list with regexp, not match type.
			if (!PartComparer.isMayFormattedListExpMatch(part, re)) {
				continue
			}

			symbols.push(...PartConvertor.toSymbolInformationList(part, this.document))
		}

		return symbols
	}
	
	/** 
	 * Get completion labels match part.
	 * `defMatchPart` must have been converted to definition type.
	 */
	getCompletionLabels(matchPart: Part, fromPart: Part, maxStylePropertyCount: number): Map<string, CompletionLabel | null> {
		let labelMap: Map<string, CompletionLabel | null> = new Map()
		let re = PartConvertor.makeStartsMatchExp(matchPart.escapedText)

		for (let part of this.getPartsByType(matchPart.type)) {

			// Now allow to complete itself.
			if (part === fromPart) {
				continue
			}

			if (!PartComparer.isMayFormattedListExpMatch(part, re)) {
				continue
			}

			// Show variable details.
			if (part.type === PartType.CSSVariableDefinition) {
				let labelText = (part as CSSVariableDefinitionPart).value
				labelMap.set(part.escapedText, labelText ? {text: labelText, markdown: undefined} : null)
			}
			else {
				let label: CompletionLabel | null = null

				if (part.isSelectorDetailedType()) {
					let wrapperPart = part.getWrapper(this)
					if (wrapperPart) {
						label = {
							text: wrapperPart.comment,
							markdown: PartConvertor.getSelectorStyleContent(wrapperPart, this.document, maxStylePropertyCount),
						}
					}
				}

				// Convert text from current type to original type of text.
				for (let text of PartComparer.mayFormatted(part)) {
					let originalTypeOfText = PartConvertor.textToType(text, matchPart.type, fromPart.type)
					labelMap.set(originalTypeOfText, label)
				}
			}
		}

		return labelMap
	}

	/** 
	 * Get completion labels match part.
	 * The difference with `getCompletionLabels` is that
	 * `fromPart` is a definition part like class name selector,
	 * but current parts are reference types of parts.
	 */
	getReferencedCompletionLabels(fromPart: Part): Map<string, CompletionLabel | null> {
		let labelMap: Map<string, CompletionLabel | null> = new Map()
		let re = PartConvertor.makeIdentifiedStartsMatchExp(PartComparer.mayFormatted(fromPart), fromPart.type)
		let defMatchPart = PartConvertor.toDefinitionMode(fromPart)

		for (let type of this.partMap.keys()) {

			// Filter by type.
			if (!PartComparer.isReferenceTypeMatch(type, defMatchPart.type)) {
				continue
			}

			for (let part of this.getPartsByType(type)) {

				// Now allow to complete itself.
				if (part === fromPart) {
					continue
				}

				// Filter by text.
				if (!PartComparer.isMayFormattedListExpMatch(part, re)) {
					continue
				}

				for (let text of PartComparer.mayFormatted(part)) {

					// Replace back from `a-b` to `&-b`.
					let mayNestedText = PartConvertor.textToType(text, part.type, fromPart.type).replace(re, fromPart.escapedText)

					if (mayNestedText === text) {
						labelMap.set(mayNestedText, null)
					}
					else {
						labelMap.set(mayNestedText, {text, markdown: undefined})
					}
				}
			}
		}

		return labelMap
	}

	/** 
	 * Find the reference locations in the HTML document from a class or id selector.
	 * `defMatchPart` must have been converted to definition type.
	 */
	findReferenceMatchParts(defMatchPart: Part, fromPart: Part, contextDefMatchParts: readonly Part[] = []): PartMatchResult {
		let result: PartMatchResult = {normal: [], contextual: []}

		// Important, use may formatted text, and also must use definition text.
		let texts = fromPart.hasFormattedList() ? PartComparer.mayFormatted(fromPart) : [defMatchPart.escapedText]

		for (let type of this.partMap.keys()) {

			// Filter by type.
			if (!PartComparer.isReferenceTypeMatch(type, defMatchPart.type)) {
				continue
			}

			for (let part of this.getPartsByType(type)) {

				// No include from part.
				// Beware this will cause some reference tests can't pass because of the build-in reference.
				// if (part === fromPart) {
				// 	continue
				// }

				// Filter by text.
				if (!PartComparer.isReferenceTextMatch(part, defMatchPart.type, texts)) {
					continue
				}

				result.normal.push(part)

				if (contextDefMatchParts.length > 0
					&& this.isDefMatchPartsSubset(contextDefMatchParts, this.getContextualDefMatchParts(part))
				) {
					result.contextual.push(part)
				}
			}
		}

		return result
	}

	/** 
	 * Find selector siblings from the nearest HTML tag or CSS selector wrapper.
	 * The source part itself is excluded.
	 */
	getContextualDefMatchParts(part: Part): Part[] {

		// In css document, resolve `.a` at `.a.b` to both match parts.
		if (part.isSelectorDetailedType()) {
			let wrapper = part.getWrapper(this)
			return wrapper?.details.filter(candidate => candidate !== part) ?? []
		}

		// In HTML document, firstly search parental tag, then search for child selectors.
		let partIndex = quickBinaryFindIndex(this.parts, p => p.start - part.start)
		if (partIndex < 0) {
			return []
		}

		let tag: Part | undefined
		let tagIndex = -1
		
		for (let i = partIndex; i >= 0; i--) {
			let candidate = this.parts[i]
			if ((candidate.type === PartType.Tag || candidate.type === PartType.ComponentTag)
				&& candidate.start <= part.start
				&& candidate.containerEnd >= part.end
			) {
				tag = candidate
				tagIndex = i
				break
			}
		}

		if (!tag) {
			return []
		}

		let defMatchParts: Part[] = tag === part ? [] : [PartConvertor.toDefinitionMode(tag)]

		for (let i = tagIndex + 1; i < this.parts.length; i++) {
			let candidate = this.parts[i]

			if (candidate.end > tag.containerEnd) {
				break
			}
			if (candidate === part) {
				continue
			}

			let defCandidate = PartConvertor.toDefinitionMode(candidate)
			if (defCandidate.isDefinitionContextualType()) {
				defMatchParts.push(defCandidate)
			}
		}

		return defMatchParts
	}

	/** Find hover from CSS document for providing class or id name hover for a HTML document. */
	findHover(defMatchPart: Part, fromPart: Part, fromDocument: TextDocument, maxStylePropertyCount: number): Hover | null {
		let parts: Part[] = []

		for (let part of this.getPartsByType(defMatchPart.type)) {

			// Not match non-primary detailed.
			if (part.isSelectorDetailedType() && !part.primary) {
				continue
			}

			if (!PartComparer.isMayFormattedListMatch(part, defMatchPart)) {
				continue
			}

			parts.push(part)
		}

		// Find independent part, if not found, use first part.
		let part = parts.find(part => part.isSelectorDetailedType() && part.independent)
		if (!part && parts.length > 0) {
			part = parts[0]
		}

		if (!part) {
			return null
		}

		if (part.isSelectorDetailedType()) {
			let wrapperPart = part.getWrapper(this)
			if (!wrapperPart) {
				return null
			}

			return PartConvertor.toHoverOfSelectorWrapper(wrapperPart, fromPart, this.document, fromDocument, maxStylePropertyCount)
		}
		else if (part.isCSSVariableDefinitionType()) {
			return PartConvertor.toHoverOfCSSVariableDefinition(part, fromPart, fromDocument)
		}

		return null
	}

	/** Find all css variable values. */
	getCSSVariables(names: Set<string>): Map<string, string> {
		let map: Map<string, string> = new Map()

		for (let part of this.getPartsByType(PartType.CSSVariableDefinition) as CSSVariableDefinitionPart[]) {
			if (!names.has(part.escapedText)) {
				continue
			}

			if (!part.value) {
				continue
			}

			map.set(part.escapedText, part.value)
		}

		return map
	}
}
