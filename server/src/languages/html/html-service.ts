import {Location, Position, Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from '../common/simple-selector'
import {HTMLNamedRange, HTMLRangeParser} from './html-range-parser'
import {HTMLScanner} from './html-scanner'
import {JSXScanner} from '../jsx/jsx-scanner'
import {CSSService} from '../css/css-service'
import {URI} from 'vscode-uri'
import {resolveImportPath} from '../../helpers/file'
import {file} from '../../helpers'
import {firstMatch} from '../../helpers/utils'
import {JSXRangeParser} from '../jsx/jsx-range-parser'



//it doesn't keep document
export class HTMLService {

	private uri: string
	private ranges: HTMLNamedRange[]

	constructor(document: TextDocument, ranges: HTMLNamedRange[]) {
		this.uri = document.uri
		this.ranges = ranges
	}

	findLocationsMatchSelector(selector: SimpleSelector): Location[] {
		let locations: Location[] = []

		for (let range of this.ranges) {
			if (range.name === selector.raw) {
				locations.push(Location.create(this.uri, range.range))
			}
		}

		return locations
	}
}


export namespace HTMLService {
	
	/** Create a temporary HTMLService. */
	export function create(document: TextDocument): HTMLService {
		let ranges: HTMLNamedRange[]

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

	function isJSXDocument(document: TextDocument) {
		return ['javascriptreact', 'typescriptreact', 'javascript', 'typescript'].includes(document.languageId)
	}

	/** If click `goto definition` at a `<link href="...">` or `<style src="...">`. */
	export async function getImportPathAt(document: TextDocument, position: Position): Promise<string | null> {
		let offset = document.offsetAt(position)
		let importPath = new HTMLScanner(document, offset).scanForImportPath()

		if (importPath) {
			return await resolveImportPath(URI.parse(document.uri).fsPath, importPath)
		}
		else {
			return null
		}
	}
	
	/** Find definitions in style tag for curent document. */
	export function findDefinitionsInInnerStyle(document: TextDocument, select: SimpleSelector): Location[] {
		let services = findInnerCSSServices(document)
		let locations: Location[] = []

		for (let {document: cssDocument, service: cssService, index: styleIndex} of services) {
			let cssLocations = cssService.findDefinitionsMatchSelector(select)

			for (let location of cssLocations) {
				let startIndexInCSS = cssDocument.offsetAt(location.range.start)
				let endIndexInCSS = cssDocument.offsetAt(location.range.end)
				let startIndexInHTML = startIndexInCSS + styleIndex
				let endIndexInHTML = endIndexInCSS + styleIndex

				locations.push(
					Location.create(document.uri, Range.create(
						document.positionAt(startIndexInHTML),
						document.positionAt(endIndexInHTML)
					))
				)
			}
		}

		return locations
	}

	/** Find auto completion labels in style tag for curent document. */
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

	/** Find references in curent document. */
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

	/** Get scss / less / css language type. */
	function getLanguageTypeFromPropertiesText(text: string): string {
		let propertiesMatch = text.match(/\b(scss|less|css)\b/i)
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
