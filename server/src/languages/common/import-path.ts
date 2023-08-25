import {LocationLink, Range} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {URI} from 'vscode-uri'


export class ImportPath {

	readonly document: TextDocument
	readonly path: string
	readonly startIndex: number
	readonly endIndex: number

	constructor(path: string, startIndex: number, endIndex: number, document: TextDocument) {
		this.document = document
		this.path = path
		this.startIndex = startIndex
		this.endIndex = endIndex
	}

	toRange() {
		return Range.create(this.document.positionAt(this.startIndex), this.document.positionAt(this.endIndex))
	}

	toLocationLink() {
		let uri = URI.file(this.path).toString()
		let targetRange = Range.create(0, 0, 0, 0)
		let selectionRange = targetRange
		let fromRange = this.toRange()

		return LocationLink.create(uri, targetRange, selectionRange, fromRange)
	}
}
