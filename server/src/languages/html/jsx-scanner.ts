import {SimpleSelector} from '../common/simple-selector'
import {ForwardScanner} from '../common/forward-scanner'


export class JSXSimpleSelectorScanner extends ForwardScanner {

	public scan(): SimpleSelector | null {
		let inExpression = false

		let word = this.readWholeWord()
		if (!word) {
			return null
		}
		
		//Should ignore <ComponentName>, it's not a truly exist elemenet which may have selector match.

		let [untilChar, readChars] = this.readUntil(['<', '\'', '"', '`'], 1024)
		if (!untilChar || untilChar === '<') {
			return null
		}

		this.skipWhiteSpaces()
		
		if (this.peek() === '{') {
			inExpression = true
			this.forward()
			this.skipWhiteSpaces()
		}
		
		if (this.read() !== '=') {
			return null
		}

		this.skipWhiteSpaces()
		let attribute = this.readWord()

		if (attribute === 'className' || attribute === 'id' && !inExpression) {
			let raw = (attribute === 'className' ? '.' : '#') + word
			return SimpleSelector.create(raw)
		}

		return null
	}
}
