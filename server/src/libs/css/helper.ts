/*
it returns the start of the right most descendant
e.g., selectors below wull returns '.a'
	.a[...]
	.a:actived
	.a::before
	.a.b
*/
export function getMainSelector(selector: string): string {
	if (!isSelector(selector)) {
		return ''
	}

	let rightMost = getRightMostDescendant(selector)
	if (!rightMost) {
		return ''
	}

	let match = rightMost.match(/^[#.]?\w[\w-]*/)
	return match ? match[0] : ''
}

//avoid parsing @keyframes anim-name as tag name
function isSelector(selector: string): boolean {
	return selector[0] !== '@'
}

//the descendant combinator used to split ancestor and descendant: space > + ~ >> ||
function getRightMostDescendant(selector: string): string {
	let descendantRE = /(?:\[[^\]]+?\]|\([^)]+?\)|[^\s>+~])+$/
	/*
		(?:
			\[[^\]]+?\] - [...]
			|
			\([^)]+?\) - (...)
			|
			[^\s>+~] - others which are not descendant combinator
		)+? - must has ?, or the greedy mode will cause unnecessary exponential fallback
		$
	*/

	let match = selector.match(descendantRE)
	return match ? match[0] : ''
}