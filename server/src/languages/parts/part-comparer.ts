import {Part, PartType} from './part'
import {PartConvertor} from './part-convertor'
import {CSSSelectorPart} from './part-css-selector'


/** 
 * Compare two parts,
 * especially to find definitions or references.
 */
export namespace PartComparer {

	/** 
	 * Try get primary of css selector to do comparing.
	 * If no css selector, returns self.
	 */
	export function mayPrimary(part: Part): Part | null {
		if (part.type === PartType.CSSSelector) {
			return (part as CSSSelectorPart).primary
		}
		else {
			return part
		}
	}

	/** Get formatted list for css selector, or text. */
	export function mayFormatted(part: Part): string[] {
		if (part.hasFormattedList()) {
			return part.formatted
		}
		else {
			return [part.text]
		}
	}

	/** Get details list for css selector, or self as list. */
	export function mayDetails(part: Part): Part[] {
		if (part.hasDetailedList()) {
			return part.details
		}
		else {
			return [part]
		}
	}


	/** Whether type of a part is totally match another part. */
	export function isTypeMatch(part1: Part, part2: Part): boolean {
		return part1.type === part2.type
	}

	/** Whether text of a part is totally match another part. */
	export function isTextMatch(part1: Part, part2: Part): boolean {
		return part1.text === part2.text
	}

	/** Whether one part text list matches another part. */
	export function isMayFormattedListMatch(testPart: Part, matchPart: Part): boolean {
		if (testPart.hasFormattedList()) {
			return testPart.formatted.some(text => text === matchPart.text)
		}
		else {
			return testPart.text === matchPart.text
		}
	}

	/** 
	 * Whether part text is wild match an regexp.
	 * Use it for finding workspace symbol.
	 */
	export function isTextExpMatch(testPart: Part, re: RegExp): boolean {
		return re.test(testPart.text)
	}

	/** Whether one part text list matches another part. */
	export function isMayFormattedListExpMatch(testPart: Part, re: RegExp): boolean {
		if (testPart.hasFormattedList()) {
			return testPart.formatted.some(text => re.test(text))
		}
		else {
			return re.test(testPart.text)
		}
	}

	/** 
	 * Whether type of like HTML reference part matches type of a CSS definition part.
	 * Use it for finding references and do class name completions for a css document.
	 * Note this will match type of it's own.
	 */
	export function isReferenceTypeMatch(testPart: Part, matchDefPart: Part): boolean {
		return PartConvertor.typeToDefinition(testPart.type) === matchDefPart.type
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

