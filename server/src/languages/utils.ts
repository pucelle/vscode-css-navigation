
/** 
 * Binary find an insert index from a list, which has been sorted.
 * And make the list is still in sorted state after inserting the new value.
 * Returned index is betweens `0 ~ list length`.
 * Note when some equal values exist, the returned index prefers lower.
 * 
 * @param fn: used to know whether a value is larger or smaller,
 * 	   it returns negative value to move right, and positive value to move left.
 */
function quickBinaryFindLowerInsertIndex<T>(sortedList: ArrayLike<T>, fn: (v: T) => number): number {
	if (sortedList.length === 0) {
		return 0
	}

	if (fn(sortedList[0]) > 0) {
		return 0
	}

	if (fn(sortedList[sortedList.length - 1]) <= 0) {
		return sortedList.length
	}

	let start = 0
	let end = sortedList.length - 1

	while (start + 1 < end) {
		let center = Math.floor((end + start) / 2)
		let result = fn(sortedList[center])

		if (result <= 0) {
			start = center
		}
		else {
			end = center
		}
	}

	// Value at start index always <= `value`, and value at end index always > `value`.
	return start
}


/** 
 * Binary find an item from a list, which has been sorted.
 * Returns the found item, or `undefined` if nothing found.
 * 
 * @param fn used to know whether a value is larger or smaller,
 *   it returns negative value to move right, and positive value to move left.
 */
export function quickBinaryFind<T>(sortedList: ArrayLike<T>, fn: (v: T) => number): T | undefined {
	let index = quickBinaryFindLowerInsertIndex(sortedList, fn)
	if (index === sortedList.length) {
		return undefined
	}

	if (fn(sortedList[index]) === 0) {
		return sortedList[index]
	}

	return undefined
}
