import {Range, TextEdit, WorkspaceEdit} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {
	CSSServiceMap,
	HTMLServiceMap,
	Part,
	PartComparer,
	PartConvertor,
	PartType,
} from './languages'
import {PartDocumentMatch} from './languages/services/base-service-map'
import {getPathExtension} from './utils'


/** Rename result. */
export interface PrepareRenameResult {
	range: Range
	placeholder: string
}


/** Get the class or id part at the rename position. */
async function getRenamePart(
	document: TextDocument,
	offset: number,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration,
): Promise<Part | null> {
	let extension = getPathExtension(document.uri)

	let serviceMap = configuration.activeHTMLFileExtensions.includes(extension)
		? htmlServiceMap
		: configuration.activeCSSFileExtensions.includes(extension)
			? cssServiceMap
			: null

	if (!serviceMap || serviceMap.isRenameExcludedURI(document.uri)) {
		return null
	}

	let service = await serviceMap.forceGetServiceByDocument(document)
	let part = service?.findDetailedPartAt(offset)

	return part && getRenameKind(part) ? part : null
}


/** Prepare class/id rename and select only the editable identifier syntax. */
export async function prepareRename(
	document: TextDocument,
	offset: number,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration,
): Promise<PrepareRenameResult | null> {
	let part = await getRenamePart(document, offset, htmlServiceMap, cssServiceMap, configuration)
	if (!part || part.rawText === '&') {
		return null
	}

	let [start, end] = getRenameOffsets(part)
	return {
		range: Range.create(document.positionAt(start), document.positionAt(end)),
		placeholder: document.getText().slice(start, end),
	}
}


/** Rename a class or id across every exact definition/reference occurrence. */
export async function rename(
	document: TextDocument,
	offset: number,
	newName: string,
	htmlServiceMap: HTMLServiceMap,
	cssServiceMap: CSSServiceMap,
	configuration: Configuration,
): Promise<WorkspaceEdit | null> {
	let fromPart = await getRenamePart(document, offset, htmlServiceMap, cssServiceMap, configuration)
	if (!fromPart || fromPart.rawText === '&') {
		return null
	}

	validateNewName(fromPart, newName)

	let defMatchPart = PartConvertor.toDefinitionMode(fromPart)
	let matches = [
		...await cssServiceMap.findRenameMatches(defMatchPart, fromPart),
		...await htmlServiceMap.findRenameMatches(defMatchPart, fromPart),
	].filter(match => {
		let map = configuration.activeCSSFileExtensions.includes(getPathExtension(match.document.uri))
			? cssServiceMap
			: htmlServiceMap
		return !map.isRenameExcludedURI(match.document.uri)
	})

	return buildRenameWorkspaceEdit(fromPart, newName, matches)
}


/** Build a workspace edit from already collected matches. Exported for focused testing. */
export function buildRenameWorkspaceEdit(fromPart: Part, newName: string, matches: readonly PartDocumentMatch[]): WorkspaceEdit | null {
	validateNewName(fromPart, newName)

	let replacements = makeSemanticReplacementMap(fromPart, newName)
	let changes: Record<string, TextEdit[]> = {}
	let seen = new Set<string>()

	for (let {part, document} of matches) {
		let replacement = makeReplacement(part, replacements)
		if (!replacement) {
			continue
		}

		let [start, end] = getRenameOffsets(part)
		let key = `${document.uri}:${start}:${end}`
		if (seen.has(key)) {
			continue
		}
		seen.add(key)

		let edit = TextEdit.replace(
			Range.create(document.positionAt(start), document.positionAt(end)),
			replacement,
		)
		let documentChanges = changes[document.uri] ??= []
		documentChanges.push(edit)
	}

	return Object.keys(changes).length > 0 ? {changes} : null
}


function getRenameKind(part: Part): 'class' | 'id' | null {
	if (part.type === PartType.Class
		|| part.type === PartType.CSSSelectorClass
		|| part.type === PartType.CSSSelectorQueryClass
		|| part.type === PartType.ReactDefaultImportedCSSModuleClass
		|| part.type === PartType.ImportedCSSModuleProperty
	) {
		return 'class'
	}

	if (part.type === PartType.Id
		|| part.type === PartType.CSSSelectorId
		|| part.type === PartType.CSSSelectorQueryId
	) {
		return 'id'
	}

	return null
}


function isNestingPart(part: Part): boolean {
	return part.isSelectorDetailedType() && part.rawText.startsWith('&')
}


function validateNewName(fromPart: Part, newName: string) {
	if (isNestingPart(fromPart)) {
		if (!/^&(?:[\w-]|\\.)+$/.test(newName)) {
			throw new Error('A nested selector rename must start with "&".')
		}
	}
	else if (!/^[\w-]+$/.test(newName)) {
		throw new Error('A class or id rename must be a single identifier without ".", "#", or "&".')
	}
}


function getRenameOffsets(part: Part): [number, number] {
	if (isNestingPart(part)) {
		return [part.start, part.end]
	}

	if (part.type === PartType.CSSSelectorClass
		|| part.type === PartType.CSSSelectorId
		|| part.type === PartType.CSSSelectorQueryClass
		|| part.type === PartType.CSSSelectorQueryId
	) {
		return [part.start + 1, part.end]
	}

	return [part.start, part.end]
}


function makeSemanticReplacementMap(fromPart: Part, newName: string): Map<string, string> {
	let defType = PartConvertor.typeToDefinition(fromPart.type)

	let oldTexts = PartComparer.mayFormatted(fromPart).map(text => {
		return PartConvertor.textToType(text, fromPart.type, defType)
	})

	let identifier = getRenameKind(fromPart) === 'class' ? '.' : '#'
	let replacements = new Map<string, string>()

	if (!isNestingPart(fromPart)) {
		for (let oldText of oldTexts) {
			replacements.set(oldText, identifier + newName)
		}
		return replacements
	}

	let oldSuffix = fromPart.rawText.slice(1)
	let newSuffix = newName.slice(1)

	for (let oldText of oldTexts) {
		if (!oldSuffix || !oldText.endsWith(oldSuffix)) {
			throw new Error('The nested selector cannot be renamed without changing its Sass nesting semantics.')
		}

		replacements.set(oldText, oldText.slice(0, -oldSuffix.length) + newSuffix)
	}

	return replacements
}


function makeReplacement(part: Part, replacements: ReadonlyMap<string, string>): string | null {
	let defType = PartConvertor.typeToDefinition(part.type)
	
	let semanticTexts = PartComparer.mayFormatted(part).map(text => {
		return PartConvertor.textToType(text, part.type, defType)
	})

	let matched = semanticTexts.filter(text => replacements.has(text))
	if (matched.length === 0) {
		return null
	}

	if (isNestingPart(part)) {
		let suffix = part.rawText.slice(1)
		let nestedReplacements = new Set(matched.map(oldText => {
			let newText = replacements.get(oldText)!
			if (!suffix || !oldText.endsWith(suffix)) {
				throw new Error('A matching nested selector cannot represent the requested rename safely.')
			}

			let prefix = oldText.slice(0, -suffix.length)
			if (!newText.startsWith(prefix)) {
				throw new Error('The requested name would change the meaning of a matching nested selector.')
			}

			return '&' + newText.slice(prefix.length)
		}))

		if (nestedReplacements.size !== 1) {
			throw new Error('The nested selector expands to incompatible rename results.')
		}

		return [...nestedReplacements][0]
	}

	let newTexts = new Set(matched.map(text => replacements.get(text)!))
	if (newTexts.size !== 1) {
		throw new Error('The selector expands to incompatible rename results.')
	}

	return [...newTexts][0].slice(1)
}
