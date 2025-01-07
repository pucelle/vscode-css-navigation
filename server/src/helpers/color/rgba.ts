import {parseHEX} from './hex'


/** RGBA color object, all value between `0~1`. */
export interface RGBA {
	r: number
	g: number
	b: number
	a: number
}


/** 
 * Parse RGBA? color format like:
 * `RGB(200, 200, 0)`, `RGBA(200, 200, 200, 0.5)`, `RGBA(#000, 0.5)`
 */
export function parseRGBA(str: string): RGBA | null {

	// `RGB(200, 200, 0)`
	let match = str.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
	if (match) {
		return {
			r: Number(match[1]) / 255,
			g: Number(match[2]) / 255,
			b: Number(match[3]) / 255,
			a: 1,
		}
	}

	// `RGBA(200, 200, 200, 0.5)`
	match = str.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i)
	if (match) {
		return {
			r: Number(match[1]) / 255,
			g: Number(match[2]) / 255,
			b: Number(match[3]) / 255,
			a: Number(match[4]),
		}
	}

	// `RGBA(#000, 0.5)`
	match = str.match(/^rgba\(\s*(#[0-9a-fA-F]{3,6})\s*,\s*([\d.]+)\s*\)$/i)
	if (match) {
		return {...parseHEX(match[1])!, a: Number(match[2])}
	}

	return null
}
