/** Get longest common subsequence length of two paths. */
export function getLongestCommonSubsequenceLength(a: string, b: string): number {
	let m = a.length
	let n = b.length
	let len = Math.min(m, n)

	for (let i = 0; i < len; i++) {
		if (a[i] !== b[i]) {
			return i
		}
	}

	return len
}
