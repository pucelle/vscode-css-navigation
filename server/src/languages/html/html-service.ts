import {Location} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {CSSSelectorPart, HTMLTokenTree, Part, PartType} from '../trees'
import {PathResolver} from '../resolver'
import {quickBinaryFind} from '../utils'


/** Scan html code pieces in files that can include HTML codes, like html, js, jsx, ts, tsx. */
export class HTMLService {

	readonly document: TextDocument
	private parts: Part[]

	constructor(document: TextDocument) {
		this.document = document

		let isJSLikeSyntax = ['javascriptreact', 'typescriptreact', 'javascript', 'typescript'].includes(document.languageId)
		this.parts = [...HTMLTokenTree.fromString(document.getText(), isJSLikeSyntax).walkParts()]
	}

	/** Get resolved import css file paths. */
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
	
	/** Find a part at specified offset. */
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

	/** Find the reference locations in the HTML document from a class or id selector. */
	findReferences(matchPart: Part): Location[] {
		let locations: Location[] = []

		for (let part of this.parts) {
			if (!part.isMatch(matchPart)) {
				continue
			}

			locations.push(part.toLocation(this.document))
		}

		return locations
	}

	/** Find completion labels from HTML document, and do complete for CSS documents. */
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
}
