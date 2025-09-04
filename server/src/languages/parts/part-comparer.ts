import {Part, PartType} from './part'
import {PartConvertor} from './part-convertor'


/** 
 * Compare two parts,
 * especially to find definitions or references.
 */
export namespace PartComparer {

	/** Get formatted list for css selector, or text. */
	export function mayFormatted(part: Part): string[] {
		if (part.hasFormattedList()) {
			return part.formatted
		}
		else {
			return [part.escapedText]
		}
	}

	/** Get details list for css selector, or self as list. */
	export function mayDetails(part: Part): Part[] {
		if (part.isSelectorWrapperType()) {
			return part.details
		}
		else {
			return [part]
		}
	}


	/** Whether text of a part is totally match another part. */
	export function isTextMatch(part1: Part, part2: Part): boolean {
		return part1.escapedText === part2.escapedText
	}

	/** Whether one part text list matches another part. */
	export function isMayFormattedListMatch(testPart: Part, matchPart: Part): boolean {
		if (testPart.hasFormattedList()) {
			return testPart.formatted.some(text => text === matchPart.escapedText)
		}
		else {
			return testPart.escapedText === matchPart.escapedText
		}
	}

	/** 
	 * Whether part text is wild match an regexp.
	 * Use it for finding workspace symbol.
	 */
	export function isTextExpMatch(testPart: Part, re: RegExp): boolean {
		return re.test(testPart.escapedText)
	}

	/** Whether one part text list matches another part. */
	export function isMayFormattedListExpMatch(testPart: Part, re: RegExp): boolean {
		if (testPart.hasFormattedList()) {
			return testPart.formatted.some(text => re.test(text))
		}
		else {
			return re.test(testPart.escapedText)
		}
	}

	/** 
	 * Whether type of like HTML reference part matches type of a CSS definition part.
	 * Use it for finding references and do class name completions for a css document.
	 * Note this will match type of it's own.
	 */
	export function isReferenceTypeMatch(testType: PartType, matchDefType: PartType): boolean {
		return PartConvertor.typeToDefinition(testType) === matchDefType
	}

	/** 
	 * Whether text of like HTML reference part matches a CSS definition text list.
	 * Use it for finding references.
	 */
	export function isReferenceTextMatch(testPart: Part, matchType: PartType, matchTexts: string[]): boolean {
		return PartComparer.mayFormatted(testPart).some(text => {
			return matchTexts.includes(PartConvertor.textToType(text, testPart.type, matchType))
		})
	}
}

