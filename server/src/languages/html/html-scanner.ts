import {SimpleSelector} from '../common/simple-selector'
import {ForwardScanner} from '../common/forward-scanner'


/*
in fact there is an easier way to do so, only about 20 lines of codes, but should be a little slower:
	1. get 1024 bytes in left.
	2. match /.*(?:(?:class\s*=\s*")(?<class>[\s\w-]*)|(?:id\s*=\s*")(?<id>[\w-]*)|<(?<tag>[\w-]+))$/s.
		.* - match any character in s flag, greedy mode, eat up all characters
		(?:
			(?:class\s*=\s*") - match class
			(?
				<class>
				[\s\w-]* - match multiple class name, can't use [\s\w-]*?[\w-]* to match, its already in greedy mode since above, another greedy expression will not work, here [\w-]* will match nothing
			)
			|
			(?:id\s*=\s*")(?<id>[\w-]*) - match id
			|
			<(?<tag>[\w-]+) - match tag
		)
		$
	3. for class, select /([\w-]+)$/.
	4. read word in right, or slice 128 bytes in right, and match /^([\w-]+)/.
	5. join left and right part.
*/
export class HTMLSimpleSelectorScanner extends ForwardScanner {

	scan(): SimpleSelector | null {
		let word = this.readWholeWord()
		if (!word) {
			return null
		}
		
		let char = this.peek()
		if (char === '<') {
			return SimpleSelector.create(word)
		}

		let [untilChar] = this.readUntil(['<', '\'', '"'])
		if (!untilChar || untilChar === '<') {
			return null
		}

		/*
		may be in left:
			class="a
			id="a'
			class="a b
			class="a" b
		have a very low possibility to meet '<tag a="class=" b', ignore it.
		the good part is it can get selectors in any place, no matter the code format.
		*/
		if (this.peek() === '\\') {
			this.forward()
		}

		this.skipWhiteSpaces()
		if (this.read() !== '=') {
			return null
		}

		this.skipWhiteSpaces()
		let attribute = this.readWord().toLowerCase()

		if (attribute === 'class' || attribute === 'id') {
			let raw = (attribute === 'class' ? '.' : '#') + word
			return SimpleSelector.create(raw)
		}

		return null
	}
}
