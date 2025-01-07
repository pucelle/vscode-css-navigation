import {RGBA} from './rgba'


/** 
 * Parse HEX color format like:
 * `#368`, `#123456`, '#00000000'
 */
export function parseHEX(hex: string): RGBA | null {
	if (!/^#([0-9a-f]{3}|[0-9a-f]{6}||[0-9a-f]{8})$/i.test(hex)) {
		return null
	}

	// `#368`
	if (hex.length === 4) {
		return {
			r: parseInt(hex[1], 16) * 17 / 255,
			g: parseInt(hex[2], 16) * 17 / 255,
			b: parseInt(hex[3], 16) * 17 / 255,
			a: 1,
		}
	}

	// `#123456`
	else if (hex.length === 7) {
		return {
			r: parseInt(hex.slice(1, 3), 16) / 255,
			g: parseInt(hex.slice(3, 5), 16) / 255,
			b: parseInt(hex.slice(5, 7), 16) / 255,
			a: 1,
		}
	}

	// `#00000000`
	else if (hex.length === 9) {
		let a = parseInt(hex.slice(7, 9), 16)

		// 0 -> 0
		// 128 -> 0.5
		// 255 -> 1
		if (a <= 128) {
			a /= 256
		}
		else {
			a = (a - 1) / 254
		}

		return {
			r: parseInt(hex.slice(1, 3), 16) / 255,
			g: parseInt(hex.slice(3, 5), 16) / 255,
			b: parseInt(hex.slice(5, 7), 16) / 255,
			a,
		}
	}

	else {
		return null
	}
}
