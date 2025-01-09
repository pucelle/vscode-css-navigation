import {RGBA} from "./rgba"

/** HSLA color object, h value between `0~6`, others `0~1`. */
export interface HSLA {
	h: number
	s: number
	l: number
	a: number
}


/** 
 * Parse HSLA? color format like:
 * `HSL(100, 60%, 80%)`, `HSLA(100, 60%, 80%, 0.5)`
 */
export function parseHSLA(str: string): HSLA | null {

	// `HSL(100, 60%, 80%)`
	let match = str.match(/^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/i)
	if (match) {
		return {
			h: Number(match[1]) / 60,
			s: Number(match[2]) / 100,
			l: Number(match[3]) / 100,
			a: 1,
		}
	}

	// `HSLA(100, 60%, 80%, 0.5)`
	match = str.match(/^hsla\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*,\s*([\d.]+)\s*\)$/i)
	if (match) {
		return {
			h: Number(match[1]) / 60,
			s: Number(match[2]) / 100,
			l: Number(match[3]) / 100,
			a: Number(match[4]),
		}
	}

	return null
}


/** Convert HSLA to RGBA. */
export function HSLA2RGBA(hsla: HSLA): RGBA {
	let {h, s, l, a} = hsla
	let maxOfRGB = l <= 0.5 ? l * (s + 1) : l + s - (l * s)
	let minOfRGB = l * 2 - maxOfRGB
	
	return {
		r: hue2RGB(minOfRGB, maxOfRGB, (h + 2) % 6),
		g: hue2RGB(minOfRGB, maxOfRGB, h),
		b: hue2RGB(minOfRGB, maxOfRGB, (h - 2 + 6) % 6),
		a,
	}
}

/** Convert Hue and RGB range to one RGB value. */
function hue2RGB(minOfRGB: number, maxOfRGB: number, hueDiff: number): number {
	if (hueDiff < 1) {
		return (maxOfRGB - minOfRGB) * hueDiff + minOfRGB
	}
	else if (hueDiff < 3) {
		return maxOfRGB
	}
	else if (hueDiff < 4) {
		return (maxOfRGB - minOfRGB) * (4 - hueDiff) + minOfRGB
	}
	else {
		return minOfRGB
	}
}


/** Convert RGBA to HSLA. */
export function RGBA2HSLA(rgba: RGBA): HSLA {
	let {r, g, b, a} = rgba
	let minOfRGB = Math.min(Math.min(r, g), b)
	let maxOfRGB = Math.max(Math.max(r, g), b)
	let l = (minOfRGB + maxOfRGB) / 2

	let s = minOfRGB == maxOfRGB
		? 0
		: (maxOfRGB - minOfRGB) / (l <= 0.5 ? minOfRGB + maxOfRGB : 2 - minOfRGB - maxOfRGB)

	let h = 0

	if (s == 0) {}
	else if (r == maxOfRGB) {
		h = ((g - b) / (maxOfRGB - minOfRGB) + 6) % 6
	}
	else if (g == maxOfRGB) {
		h = (b - r) / (maxOfRGB - minOfRGB) + 2
	}
	else if (b == maxOfRGB) {
		h = (r - g) / (maxOfRGB - minOfRGB) + 4
	}

	return {
		h,
		s,
		l,
		a,
	}
}
