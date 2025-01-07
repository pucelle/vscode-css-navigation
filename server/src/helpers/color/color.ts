import {parseHEX} from './hex'
import {HSLA2RGBA, parseHSLA, RGBA2HSLA} from './hsl'
import {HTMLColorNames} from './html-colors'
import {clamp, toDecimal} from '../number'
import {parseRGBA, RGBA} from './rgba'



/** Parse or make a color across different color formats. */
export class Color {

	/**
	 * Parse color string to a Color object.
	 * Supported formats includes:
	 * HEX: `#368`, `#123456`, '#00000000'.
	 * RGB: `RGB(200, 200, 0)`, `RGBA(200, 200, 200, 0.5)`, `RGBA(#000, 0.5)`.
	 * HSL: `HSL(100, 60%, 80%)`, `HSLA(100, 60%, 80%, 0.5)`.
	 */
	static fromString(str: string): Color | null {
		let rgba: RGBA | null = null

		// transparent.
		if (str === 'transparent' || str === 'none' || str === '') {
			rgba = {r: 0, g: 0, b: 0, a: 0}
		}

		// HTML color name.
		else if (str in HTMLColorNames) {
			let n = HTMLColorNames[str]
			let r = (n & 0xff0000) >> 16
			let g = (n & 0x00ff00) >> 8
			let b = n & 0x0000ff

			rgba = {r, g, b, a: 1}
		}

		// hex.
		else if (/^#[0-9a-f]{3,8}$/i.test(str)) {
			rgba = parseHEX(str)
		}

		else {
			let name = str.match(/^\w+/)?.[0]
			if (!name) {
				return null
			}

			// rgb, rgba.
			if (name === 'rgb' || name === 'rgba') {
				rgba = parseRGBA(str)
			}
			
			// hsl.
			else if (name === 'hsl' || name === 'hsla') {
				let hsla = parseHSLA(str)
				if (hsla) {
					rgba = HSLA2RGBA(hsla)
				}
			}
		}

		if (rgba) {
			let {r, g, b, a} = rgba
			return new Color(r, g, b, a)
		}

		return null
	}

	/** 
	 * Make a color from HSL values.
	 * H betweens `0~6`, SL betweens `0~1`.
	 */
	static fromHSL(h: number, s: number, l: number): Color {
		let rgba = HSLA2RGBA({h, s, l, a: 1})
		let {r, g, b, a} = rgba

		return new Color(r, g, b, a)
	}

	/** 
	 * Make a color from HSLA values.
	 * H betweens `0~6`, SLA betweens `0~1`.
	 */
	static fromHSLA(h: number, s: number, l: number, a: number): Color {
		let rgba = HSLA2RGBA({h, s, l, a})
		let {r, g, b} = rgba
		
		return new Color(r, g, b, a)
	}

	/** 
	 * Improve contrast of a color string compare with another color string.
	 * @param minimumLightContrast specifies the minimum light difference.
	 * @param inverseRate specifies the minimum light difference rate when the color value exceed.
	 */
	static improveColorStringContrast(
		improveColorString: string,
		compareColorString: string,
		minimumLightContrast: number = 0.2,
		minimumLightContrastRateToInverse: number = 0.5
	): string {
		if (improveColorString === 'transparent' || improveColorString === 'none') {
			return improveColorString
		}

		let improveColor = Color.fromString(improveColorString)
		let compareColor = Color.fromString(compareColorString)

		if (!improveColor || !compareColor) {
			return improveColorString
		}

		return improveColor.improveContrast(compareColor, minimumLightContrast, minimumLightContrastRateToInverse).toString()
	}

	/** Estimate whether two color strings represent the same color. */
	static colorStringEquals(color1: string, color2: string): boolean {
		if (color1 === color2) {
			return true
		}

		let c1 = Color.fromString(color1)
		let c2 = Color.fromString(color2)

		if (!c1 || !c2) {
			return false
		}

		return c1.equals(c2)
	}


	/** Red channel, betweens `0~1`. */
	r: number

	/** Green channel, betweens `0~1`. */
	g: number

	/** Blue channel, betweens `0~1`. */
	b: number

	/** Alpha channel, betweens `0~1`. */
	a: number

	constructor(r: number, g: number, b: number, a: number = 1) {
		this.r = r
		this.g = g
		this.b = b
		this.a = a
	}

	/** Get `{h, s, l}` values, h betweens `0~6`, others betweens `0~1`. */
	get hsl(): {h: number, s: number, l: number} {
		let hsla = RGBA2HSLA(this)
		let {h, s, l} = hsla

		return {h, s, l}
	}

	/** Get `{h, s, l, a}` values, h betweens `0~6`, others betweens `0~1`. */
	get hsla(): {h: number, s: number, l: number, a: number} {
		let hsla = RGBA2HSLA(this)
		return hsla
	}

	/** Get average of RGB, `0~1`. */
	get gray(): number {
		return (this.r + this.g + this.b) / 3
	}

	/** Clone current color, returns a new color. */
	clone() {
		return new Color(this.r, this.g, this.b, this.a)
	}

	/** Test whether equals another color. */
	equals(c: Color): boolean {
		return this.r === c.r
			&& this.g === c.g
			&& this.b === c.b
			&& this.a === c.a
	}

	/** Convert to `rgb(...)` format. */
	toRGB(): string {
		let {r, g, b} = this

		r = clamp(Math.round(r * 255), 0, 255)
		g = clamp(Math.round(g * 255), 0, 255)
		b = clamp(Math.round(b * 255), 0, 255)

		return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
	}

	/** Convert to `rgba(...)` format. */
	toRGBA(): string {
		let {r, g, b, a} = this

		r = clamp(Math.round(r * 255), 0, 255)
		g = clamp(Math.round(g * 255), 0, 255)
		b = clamp(Math.round(b * 255), 0, 255)
		a = clamp(toDecimal(a, 3), 0, 1)

		return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`
	}

	/** Convert to `#XXXXXX` format. */
	toHEX(): string {
		let {r, g, b, a} = this

		r = clamp(Math.round(r * 255), 0, 255)
		g = clamp(Math.round(g * 255), 0, 255)
		b = clamp(Math.round(b * 255), 0, 255)
		a = clamp(toDecimal(a, 3), 0, 1)

		if (this.a < 1) {
			return '#' + [r, g, b, a].map(v => v.toString(16).padStart(2, '0')).join('')
		}
		else {
			return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
		}
	}

	/** Convert to `HSL(...)` format. */
	toHSL() {
		let hsla = RGBA2HSLA(this)
		let {h, s, l} = hsla

		h = clamp(Math.round(h * 60), 0, 360)
		s = clamp(Math.round(s * 100), 0, 100)
		l = clamp(Math.round(l * 100), 0, 100)

		return `hsl(${h}, ${s}%, ${l}%)`
	}

	/** Convert to `HSLA(...)` format. */
	toHSLA() {
		let hsla = RGBA2HSLA(this)
		let {h, s, l, a} = hsla

		h = clamp(Math.round(h * 60), 0, 360)
		s = clamp(Math.round(s * 100), 0, 100)
		l = clamp(Math.round(l * 100), 0, 100)
		a = clamp(toDecimal(a, 3), 0, 1)

		return `hsla(${h}, ${s}%, ${l}%, ${a})`
	}

	/** Darken color, `rate` betweens `0~1`. */
	darken(rate: number): Color {
		return this.lighten(-rate)
	}

	/** Lighten color, `rate` betweens `0~1`. */
	lighten(rate: number): Color {
		let {r, g, b, a} = this

		r += rate
		g += rate
		b += rate

		return new Color(r, g, b, a)
	}

	/** Invert current color and get a new color. */
	invert() {
		let {r, g, b, a} = this
		return new Color(1 - r, 1 - g, 1 - b, a)
	}

	/** 
	 * To darker if is a light color,
	 * and to lighter if is a dark color.
	 * `rate` between `0~0.5`.
	 * If you are more familiar with `0~255` RGB bytes, you may use like `10/255`.
	 */
	toIntermediate(rate: number): Color {
		if (this.gray < 0.5) {
			return this.lighten(rate)
		}
		else {
			return this.darken(rate)
		}
	}

	/** Mix with another color, by `rate`. */
	mix(c: Color, rate: number): Color {
		return new Color(
			this.r * (1 - rate) + c.r * rate,
			this.g * (1 - rate) + c.g * rate,
			this.b * (1 - rate) + c.b * rate,
			this.a * (1 - rate) + c.a * rate,
		)
	}

	/** Return a new color with new alpha value set. */
	alpha(a: number) {
		return new Color(
			this.r,
			this.g,
			this.b,
			a,
		)
	}

	/** Convert to RGB or RGBA format. */
	toString() {
		if (this.a === 1) {
			return this.toHEX()
		}

		return this.toRGBA()
	}

	/** 
	 * Improve contrast compare with another color.
	 * @param minimumLightContrast specifies the minimum light difference.
	 * @param inverseContrastRate specifies the rate which will multiple with `minimumLightContrast` when the color value exceed 0~1.
	 */
	improveContrast(compareColor: Color, minimumLightContrast: number = 0.15, inverseContrastRate: number = 0.5) {
		let hsl = RGBA2HSLA(this)
		let compareHSL = RGBA2HSLA(compareColor)

		// Calc the light diff in HSL color space.
		let hslDiff = Math.abs(hsl.l - compareHSL.l)
		let hslToFix = minimumLightContrast - hslDiff
		
		// Difference enough. 
		if (hslToFix <= 0) {
			return this
		}

		// Lighter current color .
		if (hsl.l > compareHSL.l) {
			hsl.l += hslToFix

			if (hsl.l > 100) {

				// If set current color much darker directly, it may change much,
				// So here shrink it with a inverseRate, which < 1.
				if (hslToFix > minimumLightContrast * inverseContrastRate) {
					hsl.l = compareHSL.l - minimumLightContrast
				}
				else {
					hsl.l = 100
				}
			}
		}

		// Darker current color .
		else {
			hsl.l -= hslToFix
			
			if (hsl.l < 0) {
				if (hslToFix > minimumLightContrast * inverseContrastRate) {
					hsl.l = compareHSL.l + minimumLightContrast
				}
				else {
					hsl.l = 0
				}
			}
		}
	
		return Color.fromHSLA(hsl.h, hsl.s, hsl.l, this.a).toString()
	}
}
