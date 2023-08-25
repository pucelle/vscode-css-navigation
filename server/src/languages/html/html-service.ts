import {Location, LocationLink, Position, Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from '../common/simple-selector'
import {HTMLRange, HTMLRangeParser} from './html-range-parser'
import {HTMLScanner} from './html-scanner'
import {JSXScanner} from '../jsx/jsx-scanner'
import {CSSService} from '../css/css-service'
import {URI} from 'vscode-uri'
import {resolveImportPath} from '../../helpers/file'
import {file} from '../../helpers'
import {firstMatch} from '../../helpers/utils'
import {JSXRangeParser} from '../jsx/jsx-range-parser'
import {ImportPath} from '../common/import-path'



/** Scan html code pieces in files that can include HTML codes, like html, js, jsx, ts, tsx. */
export class HTMLService {

	private uri: string
	private ranges: HTMLRange[]

	constructor(document: TextDocument, ranges: HTMLRange[]) {
		this.uri = document.uri
		this.ranges = ranges
	}

	/** Find the location in the HTML document for specified selector label. */
	findLocationsMatchSelector(selector: SimpleSelector): Location[] {
		let locations: Location[] = []

		for (let range of this.ranges) {
			if (range.name === selector.raw) {
				locations.push(Location.create(this.uri, range.range))
			}
		}

		return locations
	}

	/** Find completion label for a CSS document, from selectors in HTML document. */
	findCompletionLabelsMatch(prefix: string): string[] {
		let labelSet: Set<string> = new Set()

		for (let range of this.ranges) {
			if (range.name.startsWith(prefix)) {
				let label = range.name
				labelSet.add(label)
			}
		}

		return [...labelSet.values()]
	}
}


export namespace HTMLService {
	
	/** Create a temporary HTMLService. */
	export function create(document: TextDocument): HTMLService {
		let ranges: HTMLRange[]

		if (isJSXDocument(document)) {
			ranges = new JSXRangeParser(document).parse()
		}
		else {
			ranges = new HTMLRangeParser(document).parse()
		}

		return new HTMLService(document, ranges)
	}

	/** Search a selector from specified position in a document. */
	export async function getSimpleSelectorAt(document: TextDocument, position: Position): Promise<SimpleSelector | null> {
		let offset = document.offsetAt(position)

		if (isJSXDocument(document)) {
			let selector = await new JSXScanner(document, offset).scanSelector()
			if (selector) {
				return selector
			}
		}

		return new HTMLScanner(document, offset).scanForSelector()
	}

	/** Whether document is a js, jsx, ts, tsx document. */
	function isJSXDocument(document: TextDocument) {
		return ['javascriptreact', 'typescriptreact', 'javascript', 'typescript'].includes(document.languageId)
	}

	/** 
	 * If click `goto definition` at a `<link href="...">` or `<style src="...">`.
	 * Returned result has been resolved to an absolute path.
	 */
	export async function getImportPathAt(document: TextDocument, position: Position): Promise<ImportPath | null> {
		let offset = document.offsetAt(position)
		let importPath = await (new HTMLScanner(document, offset).scanForImportPath())

		if (!importPath && isJSXDocument(document)) {
			importPath = await (new JSXScanner(document, offset).scanForImportPath())
		}

		return importPath
	}
	
	/** Find definitions in style tag for current document. */
	export function findDefinitionsInInnerStyle(document: TextDocument, selector: SimpleSelector): LocationLink[] {
		let services = findInnerCSSServices(document)
		let locations: LocationLink[] = []

		for (let {document: cssDocument, service: cssService, index: styleIndex} of services) {
			let cssLocations = cssService.findDefinitionsMatchSelector(selector)

			for (let location of cssLocations) {
				let startIndexInCSS = cssDocument.offsetAt(location.targetRange.start)
				let endIndexInCSS = cssDocument.offsetAt(location.targetRange.end)
				let startIndexInHTML = startIndexInCSS + styleIndex
				let endIndexInHTML = endIndexInCSS + styleIndex

				let targetRange = Range.create(
					document.positionAt(startIndexInHTML),
					document.positionAt(endIndexInHTML)
				)
				
				let selectionRange = Range.create(targetRange.start, targetRange.start)
				let htmlLocation = LocationLink.create(document.uri, targetRange, selectionRange, selector.toRange())

				locations.push(htmlLocation)
			}
		}

		return locations
	}

	/** Find auto completion labels in style tag for current document. */
	export function findCompletionLabelsInInnerStyle(document: TextDocument, select: SimpleSelector) {
		let services = findInnerCSSServices(document)
		let labels: string[] = []

		for (let {service: cssService} of services) {
			labels.push(...cssService.findCompletionLabelsMatchSelector(select))
		}

		return labels
	}

	/** Get all inner CSS services. */
	function findInnerCSSServices(document: TextDocument) {
		let text = document.getText()
		let re = /<style\b(.*?)>(.*?)<\/style>|\bcss`(.*?)`/gs
		let match: RegExpExecArray | null
		let services: {document: TextDocument, service: CSSService, index: number}[] = []

		while (match = re.exec(text)) {
			let languageId = match[1] ? getLanguageTypeFromPropertiesText(match[1] || '') : 'css'
			let cssText = match[2] || match[3] || ''

			let styleIndex = match[2]
				? re.lastIndex - 8 - cssText.length	// 8 is the length of '</style>'
				: re.lastIndex - 1 - cssText.length	// 1 is the length of '`'

			let cssDocument = TextDocument.create('untitled.' + languageId , languageId, 0, cssText)
			let service = CSSService.create(cssDocument, false)

			services.push({
				document: cssDocument,
				service,
				index: styleIndex,
			})
		}

		return services
	}

	/** Find references in current HTML document, from inner style declaration in <style>. */
	export function findReferencesInInnerHTML(document: TextDocument, position: Position, htmlService: HTMLService): Location[] | null {
		let text = document.getText()
		let re = /<style\b(.*?)>(.*?)<\/style>/gs
		let match: RegExpExecArray | null
		let offset = document.offsetAt(position)

		while (match = re.exec(text)) {
			let languageId = getLanguageTypeFromPropertiesText(match[1] || '')
			let cssText = match[2]
			let styleStartIndex = re.lastIndex - 8 - cssText.length
			let styleEndIndex = styleStartIndex + cssText.length
			let locations: Location[] = []

			if (offset >= styleStartIndex && offset < styleEndIndex) {
				let cssDocument = TextDocument.create('untitled.' + languageId , languageId, 0, cssText)
				let selectors = CSSService.getSimpleSelectorsAt(cssDocument, cssDocument.positionAt(offset - styleStartIndex))
				if (selectors) {
					for (let selector of selectors) {
						locations.push(...htmlService.findLocationsMatchSelector(selector))
					}
				}

				return locations
			}
		}

		return null
	}

	/** Get sass / scss / less / css language type. */
	function getLanguageTypeFromPropertiesText(text: string): string {
		let propertiesMatch = text.match(/\b(scss|sass|less|css)\b/i)
		let languageId = propertiesMatch ? propertiesMatch[1].toLowerCase() : 'css'
	
		return languageId
	}

	/** Scan paths of linked or imported style files. */
	export async function scanStyleImportPaths(document: TextDocument) {
		let text = document.getText()
		let re = /<link[^>]+rel\s*=\s*['"]stylesheet['"]>/g
		let hrefRE = /\bhref\s*=['"](.*?)['"]/
		let match: RegExpExecArray | null
		let documentPath = URI.parse(document.uri).fsPath
		let documentExtension = file.getPathExtension(document.uri)
		let importFilePaths: string[] = []

		while (match = re.exec(text)) {
			let relativePath = firstMatch(match[0], hrefRE)
			if (!relativePath) {
				continue
			}

			let filePath = await resolveImportPath(documentPath, relativePath)
			if (filePath) {
				importFilePaths.push(filePath)
			}
		}

		if (documentExtension === 'vue') {
			importFilePaths.push(...await scanVueStyleImportPaths(document))
		}

		return importFilePaths
	}

	/** Scan paths of imported style files for vue files. */
	async function scanVueStyleImportPaths(document: TextDocument) {
		let text = document.getText()
		let re = /<style[^>]+src\s*=['"](.*?)['"]>/g
		let match: RegExpExecArray | null
		let documentPath = URI.parse(document.uri).fsPath
		let importFilePaths: string[] = []

		while (match = re.exec(text)) {
			let relativePath = match[1]
			let filePath = await resolveImportPath(documentPath, relativePath)
			if (filePath) {
				importFilePaths.push(filePath)
			}
		}

		return importFilePaths
	}
}
