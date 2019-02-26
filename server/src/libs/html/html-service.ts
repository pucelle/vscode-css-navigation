import {Position, TextDocument, Location, Range} from 'vscode-languageserver'
import {CSSSymbol} from '../css/css-symbol'
import {HTMLSimpleSelectorScanner} from './html-scanner'


export interface SimpleSelector {
	type: SimpleSelector.Type
	value: string
	raw: string
}

export namespace SimpleSelector {

	export enum Type{
		Tag,
		Class,
		Id
	}
	
	export function create(raw: string): SimpleSelector | null {
		if (!validate(raw)) {
			return null
		}

		let type = raw[0] === '.' ? Type.Class
			: raw[0] === '#' ? Type.Id
			: Type.Tag

		let value = type === Type.Tag ? raw : raw.slice(1)

		return {
			type,
			value,
			raw
		}
	}

	export function validate(raw: string): boolean {
		return /^[#.]?\w[\w-]*$/i.test(raw)
	}

	export function getAtPosition(document: TextDocument, position: Position): SimpleSelector | null {
		let text = document.getText()
		let offset = document.offsetAt(position)
		
		return new HTMLSimpleSelectorScanner(text, offset).scan()
	}
}


export function findDefinitionMatchSelectorInInnerStyle(document: TextDocument, select: SimpleSelector): Location[] {
	let text = document.getText()
	let re = /<style\b(.*?)>(.*?)<\/style>/gs
	let match: RegExpExecArray | null
	let locations: Location[] = []

	while (match = re.exec(text)) {
		let propertiesText = match[1] || ''
		let cssText = match[2]
		let propertiesMatch = propertiesText.match(/type\s*=\s*"text\/(scss|less|css)"/i)
		let languageId = propertiesMatch ? propertiesMatch[1].toLowerCase() : 'css'
		let styleIndex = re.lastIndex - 8 - cssText.length
		let cssDocument = TextDocument.create('untitled', languageId, 0, cssText)
		let cssLocations = CSSSymbol.create(cssDocument).findLocationsMatchSelector(select)

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