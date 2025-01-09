
/** Constrain value to be in range `min ~ max`. */
export function clamp(x: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, x))
}


/**
 * Convert number to make it in fixed-point notation.
 * Works like `number.toFixed`, but alway returns a number.
 * @param decimalCount The decimal count that `number` will be fixed to.
 * 
 * e.g.:
 * ```
 *   toDecimal(12.345, 2) = 12.34
 * 	 toDecimal(12345, -2) = 12300
 * ```
 */
export function toDecimal(number: number, decimalCount: number): number {
	if (number === 0) {
		return 0
	}

	Number.prototype.toFixed

	if (decimalCount > 0) {
		let n = Math.pow(10, decimalCount)
		return Math.round(number * n) / n
	}
	else {
		let n = Math.pow(10, -decimalCount)
		return Math.round(number / n) * n
	}
}
