import {Location, Position, Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {SimpleSelector} from '../common/simple-selector'
import {NamedRange, HTMLRangeParser} from './html-range-parser'
import {HTMLSimpleSelectorScanner} from './html-scanner'
import {JSXSimpleSelectorScanner} from './jsx-scanner'
import {CSSService} from '../css/css-service'



//it doesn't keep document
export class HTMLService {

	private uri: string
	private ranges: NamedRange[]

	constructor(document: TextDocument, ranges: NamedRange[]) {
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
	
	export function create(document: TextDocument): HTMLService {
		let ranges = new HTMLRangeParser(document).parse()
		return new HTMLService(document, ranges)
	}

	export async function searchSimpleSelectorAt(document: TextDocument, position: Position): Promise<SimpleSelector | null> {
		let offset = document.offsetAt(position)

		if (['javascriptreact', 'typescriptreact', 'javascript', 'typescript'].includes(document.languageId)) {
			let selector = await new JSXSimpleSelectorScanner(document, offset).scan()
			if (selector) {
				return selector
			}
		}

		return new HTMLSimpleSelectorScanner(document, offset).scan()
	}

	export function findDefinitionsInInnerStyle(document: TextDocument, select: SimpleSelector): Location[] {
		let text = document.getText()
		let re = /<style\b(.*?)>(.*?)<\/style>|css`(.*?)`/gs
		let match: RegExpExecArray | null
		let locations: Location[] = []

		while (match = re.exec(text)) {
			let languageId = match[1] ? getLanguageIdFromPropertiesText(match[1] || '') : 'css'
			let cssText = match[2] || match[3]

			let styleIndex = match[2]
				? re.lastIndex - 8 - cssText.length	// 8 is the length of `</style>`
				: re.lastIndex - 1 - cssText.length	// 1 is the length of `

			let cssDocument = TextDocument.create('untitled.' + languageId , languageId, 0, cssText)
			let cssLocations = CSSService.create(cssDocument).findDefinitionsMatchSelector(select)

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

	export function findReferencesInInner(document: TextDocument, position: Position, htmlService: HTMLService): Location[] | null {
		let text = document.getText()
		let re = /<style\b(.*?)>(.*?)<\/style>/gs
		let match: RegExpExecArray | null
		let locations: Location[] = []
		let offset = document.offsetAt(position)

		while (match = re.exec(text)) {
			let languageId = getLanguageIdFromPropertiesText(match[1] || '')
			let cssText = match[2]
			let styleStartIndex = re.lastIndex - 8 - cssText.length
			let styleEndIndex = styleStartIndex + cssText.length

			if (offset >= styleStartIndex && offset < styleEndIndex) {
				let cssDocument = TextDocument.create('untitled.' + languageId , languageId, 0, cssText)
				let selectors = CSSService.getSimpleSelectorAt(cssDocument, cssDocument.positionAt(offset - styleStartIndex))
				if (selectors) {
					for (let selector of selectors) {
						locations.push(...htmlService.findLocationsMatchSelector(selector))
					}
				}
			}
		}

		return locations
	}

	function getLanguageIdFromPropertiesText(text: string): string {
		let propertiesMatch = text.match(/\b(scss|less|css)\b/i)
		let languageId = propertiesMatch ? propertiesMatch[1].toLowerCase() : 'css'
	
		return languageId
	}	
}
