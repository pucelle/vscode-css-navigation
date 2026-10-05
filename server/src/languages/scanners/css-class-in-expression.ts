import {LanguageIds} from '../language-ids'
import {AnyTokenScanner} from './any'


// For scanning css selector in expression:
// 1. `{'class'}`
// 2. `{variable}`
// 3. `{variable ? 'class' : 'class'}`
// 4. `non-class-`${variable ? 'a' : 'b'}`
// 5. `{['class', 'class']}`


/** Parsed CSS class name token. */
export interface CSSClassInExpressionToken {
	type: CSSClassInExpressionTokenType
	text: string
	start: number
	end: number
}


/** CSS class-in-expression token type. */
export enum CSSClassInExpressionTokenType {
	

	/** A class name. */
	ClassName,

	/** 
	 * "" or '', become a class name after complete.
	 * or "| a", "a |", or "a | b".
	 */
	PotentialClassName,

	ReactModuleName,
	ReactModuleProperty,
}

enum ScanState {
	EOF = 0,
	AnyContent = 1,
	WithinString,
	WithinExpression,
	WithinVariable,
	WithinObject,
	WithinArray,
}


/** For scanning class name in expression. */
export class CSSClassInExpressionTokenScanner extends AnyTokenScanner<CSSClassInExpressionTokenType> {

	declare readonly languageId: CSSLanguageId
	declare protected state: ScanState

	/** Start index of string part. */
	private stringStart: number = -1

	/** To ensure string quotes match. */
	private stringStartStack: number[] = []

	/** Whether a string's first or last word joins an adjacent expression. */
	private stringJoinedLeft = false
	private stringJoinedRight = false
	private stringJoinStack: Array<{left: boolean, right: boolean}> = []

	/** 
	 * If can knows that current string is absolute an expression,
	 * no bracket marker like `{...}`,
	 * like x-bind:class=`variable ? a : b`,
	 * or :class=`{prop: boolean}`
	 * 
	 * `alreadyAnExpression` indicates whether have no `${...}` or `{...}` wrapped and already an expression.
	 * `stopAfterExpression` requires `alreadyAnExpression` to be true.
	 */
	constructor(
		string: string,
		scannerStart: number = 0,
		languageId: AllLanguageId,
		alreadyAnExpression: boolean,
		stopAfterExpression: boolean = false
	) {
		super(stopAfterExpression ? string.slice(0, CSSClassInExpressionTokenScanner.expressionEnd(string)) : string, scannerStart, languageId)

		if (alreadyAnExpression) {
			if (stopAfterExpression) {
				this.state = ScanState.WithinExpression
			}
			else {
				this.enterState(ScanState.WithinExpression)
			}

		}
	}

	/** Bound a JS initializer without consuming the next statement or property. */
	private static expressionEnd(text: string): number {
		let scanner = new CSSClassInExpressionTokenScanner(text, 0, 'js', true)
		let brackets: string[] = []
		let canEnd = false
		let lineBreak = false

		while (scanner.offset < text.length) {
			let start = scanner.offset
			let char = scanner.peekChar()

			if (/\s/.test(char)) {
				lineBreak ||= /[\r\n]/.test(char)
				scanner.offset++
				continue
			}

			if (scanner.skipComment()) {
				lineBreak ||= /[\r\n]/.test(text.slice(start, scanner.offset))
				continue
			}

			let word = /^[\w$]+/.exec(text.slice(start))?.[0]

			let continues = /[.([`?+\-*/%&|^<>=!:,]/.test(char)
				|| word === 'in' || word === 'instanceof' || word === 'as' || word === 'satisfies'

			if (brackets.length === 0 && (
				char === ';' || char === ',' || char === '}' || char === ')'
				|| lineBreak && canEnd && (!continues || text.startsWith('++', start) || text.startsWith('--', start))
			)) {
				return start
			}

			lineBreak = false
			if (char === '"' || char === "'" || char === '`') {
				if (char === '`') scanner.readTemplateLiteral()
				else scanner.readString()
				canEnd = true
			}
			else if (word) {
				scanner.offset += word.length
				canEnd = !['new', 'typeof', 'void', 'delete', 'await', 'yield', 'in', 'instanceof', 'as', 'satisfies'].includes(word)
			}
			else {
				scanner.offset++
				if ('([{'.includes(char)) {
					brackets.push(char)
					canEnd = false
				}
				else if (')]}'.includes(char)) {
					brackets.pop()
					canEnd = true
				}
				else canEnd = false
			}
		}

		return text.length
	}

	protected override readWhiteSpaces(): boolean {
		while (super.readWhiteSpaces()) {
			if (!this.skipComment()) return true
		}

		return false
	}

	protected get quoted(): string | null {
		if (this.stringStart > 0) {
			return this.string[this.stringStart - 1]
		}
		else {
			return null
		}
	}

	enterStringState() {
		let quoteStart = this.offset - 1

		let joins = this.state !== ScanState.AnyContent && this.string[quoteStart] !== '`'
			? this.getStringJoinSides(quoteStart)
			: {left: false, right: false}

		this.enterState(ScanState.WithinString)
	
		if (this.stringStart > -1) {
			this.stringStartStack.push(this.stringStart)

			this.stringJoinStack.push({
				left: this.stringJoinedLeft,
				right: this.stringJoinedRight
			})
		}

		this.stringStart = this.offset
		this.stringJoinedLeft = joins.left
		this.stringJoinedRight = joins.right
	}

	/** Find which edge words may be partial classes after concatenation. */
	private getStringJoinSides(quoteStart: number): {left: boolean, right: boolean} {
		let quote = this.string[quoteStart]
		let end = quoteStart + 1

		while (end < this.string.length) {
			if (this.string[end] === '\\') {
				end += 2
			}
			else if (this.string[end] === quote) {
				end++
				break
			}
			else {
				end++
			}
		}

		let before = this.skipTriviaBackward(quoteStart)
		let after = this.skipTriviaForward(end)
		let previous = this.string.slice(Math.max(0, before - 3), before)
		let following = this.string.slice(after, after + 3)

		return {
			left: !previous.endsWith('=>')
				&& /(?:[+*\/%^-]|={2,3}|!={1,2}|<=?|>=?)$/.test(previous),
			right: /^(?:[+*\/%^-]|={2,3}|!={1,2}|<=?|>=?)/.test(following),
		}
	}

	/** Skip whitespace and completed block comments preceding an offset. */
	private skipTriviaBackward(offset: number): number {
		while (offset > 0) {
			if (/\s/.test(this.string[offset - 1])) {
				offset--
			}
			else if (this.string.slice(offset - 2, offset) === '*/') {
				let commentStart = this.string.lastIndexOf('/*', offset - 2)
				if (commentStart < 0) {
					break
				}

				offset = commentStart
			}
			else {
				break
			}
		}

		return offset
	}

	/** Skip whitespace and comments following an offset. */
	private skipTriviaForward(offset: number): number {
		while (offset < this.string.length) {
			if (/\s/.test(this.string[offset])) {
				offset++
			}
			else if (this.string.startsWith('/*', offset)) {
				let commentEnd = this.string.indexOf('*/', offset + 2)
				offset = commentEnd < 0 ? this.string.length : commentEnd + 2
			}
			else if (this.string.startsWith('//', offset)) {
				let lineEnd = /[\r\n]/g
				lineEnd.lastIndex = offset + 2
				offset = lineEnd.exec(this.string)?.index ?? this.string.length
			}
			else {
				break
			}
		}

		return offset
	}

	exitStringState() {
		this.exitState()
		this.stringStart = this.stringStartStack.pop()!
		
		let joins = this.stringJoinStack.pop()
		this.stringJoinedLeft = joins?.left ?? false
		this.stringJoinedRight = joins?.right ?? false
	}

	/** 
	 * Parse to CSS selector tokens.
	 * This is rough tokens, more details wait to be determined.
	 */
	*parseToTokens(): Iterable<CSSClassInExpressionToken> {
		let offset = -1

		while (this.state !== ScanState.EOF) {

			// Base rules: offset must move ahead in each loop.
			if (this.offset <= offset) {
				this.offset = offset + 1
			}
			offset = this.offset

			if (this.state === ScanState.AnyContent) {
				if (!this.readUntilToMatch(/['"`{$\/]/g)) {
					break
				}

				let char = this.peekChar()
				if (this.skipComment()) continue

				// `|${`
				if (char === '$' && this.peekChar(1) === '{' && LanguageIds.isScriptSyntax(this.languageId)) {

					// Move to `${|`
					this.offset += 2

					this.enterState(ScanState.WithinExpression)
				}

				// `|{`
				else if (char === '{' && LanguageIds.isScriptSyntax(this.languageId)) {
	
					// Move to `{|`
					this.offset += 1

					this.enterState(ScanState.WithinExpression)
				}

				// `|'` or `|"` or `|``
				else if (char === '\'' || char === '"' || char === '`') {

					// Move to `"|`
					this.offset += 1

					this.enterStringState()
				}
			}

			else if (this.state === ScanState.WithinString) {
				if (!this.readUntilToMatch(/['"`\\\w-${\s]/g)) {
					break
				}

				let char = this.peekChar()

				// `|${`
				if (char === '$') {
					if (this.peekChar(1) === '{' && LanguageIds.isScriptSyntax(this.languageId)) {
						
						// Move to `${|`
						this.offset += 2

						this.enterState(ScanState.WithinExpression)
					}
					else {

						// Move to `$|`
						this.offset += 1
					}
				}

				// `|\\`, skip next char.
				else if (char === '\\') {

					// Move to `\"|`
					this.offset += 2
				}

				// `|'` or `|"` or `|``
				else if (char === '\'' || char === '"' || char === '`') {
					if (char === this.quoted) {

						// "|"
						if (this.stringStart === this.offset) {
							this.sync()
							yield this.makeToken(CSSClassInExpressionTokenType.PotentialClassName)
						}

						// "name |"
						else if (/\s/.test(this.peekChar(-1))) {
							this.sync()
							yield this.makeToken(CSSClassInExpressionTokenType.PotentialClassName)
						}

						// Move to `"|`
						this.offset += 1

						this.exitStringState()
					}
					else {

						// Move after `"|`
						this.offset += 1
					}
				}

				// `| `
				else if (/\s/.test(char)) {
					this.sync()
					yield* this.handleClassNameSpaces()
				}

				// `|[\w_]`
				else {
					this.sync()
					yield* this.handleClassName()
				}
			}

			else if (this.state === ScanState.WithinExpression) {
				if (!this.readUntilToMatch(/['"`{\[\w\}\/]/g)) {
					break
				}

				let char = this.peekChar()

				// `|'` or `|"` or `|``
				if (this.skipComment()) {
					continue
				}
				else if (char === '\'' || char === '"' || char === '`') {

					// Move to `"|`
					this.offset += 1

					this.enterStringState()
				}

				// `|{`
				else if (char === '{') {
	
					// Move to `{|`
					this.offset += 1
					this.enterState(ScanState.WithinObject)
				}

				// `|[`
				else if (char === '[') {
	
					// Move to `[|`
					this.offset += 1
					this.enterState(ScanState.WithinArray)
				}

				// `|}`
				else if (char === '}') {
	
					// Move to `}|`
					this.offset += 1
					this.exitState()
				}

				// `|a`
				else {
					this.enterState(ScanState.WithinVariable)
					this.sync()
				}
			}

			else if (this.state === ScanState.WithinVariable) {

				// `abc|`
				this.readUntilNot(/\w/g)

				let nameToken = this.makeToken(CSSClassInExpressionTokenType.ReactModuleName)

				if (!this.readWhiteSpaces()) {
					break
				}

				let char = this.peekChar()
				if (char === '.') {

					// Move to `.|`
					this.offset += 1
					if (!this.readWhiteSpaces()) break
					this.sync()

					this.readUntilNot(/\w/g)
					let propertyToken = this.makeToken(CSSClassInExpressionTokenType.ReactModuleProperty)

					if (propertyToken.text.length > 0) {
						yield nameToken
						yield propertyToken
					}
				}
				else if (char === '[') {

					// Move to `[|`
					this.offset += 1
					
					if (!this.readWhiteSpaces()) {
						break
					}

					char = this.peekChar()

					// Move to `|'`
					if (char === '\'' || char === '"' || char === '`') {
						this.sync()

						if (!this.readString()) {
							return
						}

						let propertyToken = this.makeToken(CSSClassInExpressionTokenType.ReactModuleProperty, 1, -1)

						if (propertyToken.text.length > 0) {
							yield nameToken
							yield propertyToken
						}

						// Move to `'|`
						this.offset += 1

						// Move to `]|`
						this.readOutToMatch(/]/g)
					}
				}

				// Function-call arguments may be keys or other data, not class names.
				if (this.peekChar() === '(') {
					this.readBracketed()
				}

				this.exitState()
			}

			else if (this.state === ScanState.WithinObject) {

				// `{|`
				if (!this.readUntilToMatch(/[\w'"`}\/]/g)) {
					break
				}

				let char = this.peekChar()

				if (this.skipComment()) continue

				// `|}`
				if (char === '}') {

					// Move to `}|`
					this.offset += 1

					this.exitState()
				}

				// `|'...':`
				else if (char === '\'' || char === '"' || char === '`') {
					this.sync()

					if (!this.readString()) {
						break
					}

					let propertyToken = this.makeToken(CSSClassInExpressionTokenType.ClassName, 1, -1)
					if (!this.readWhiteSpaces()) {
						break
					}

					if (this.peekChar() === ':') {
						if (propertyToken.text.length > 0) {
							yield propertyToken
						}
					}
				}

				// `|a`
				else {
					this.sync()

					// `abc|`
					this.readUntilNot(/\w/g)

					let propertyToken = this.makeToken(CSSClassInExpressionTokenType.ClassName)
					if (!this.readWhiteSpaces()) {
						break
					}

					if (this.peekChar() === ':') {
						if (propertyToken.text.length > 0) {
							yield propertyToken
						}
					}
				}

				while (true) {
					if (!this.readUntilToMatch(/[\{\[\(,}'"`\/]/g)) {
						break
					}

					char = this.peekChar()
					if (this.skipComment()) continue
					if (char === '"' || char === "'" || char === '`') {
						if (char === '`') this.readTemplateLiteral()
						else this.readString()
						continue
					}

					// Skip all bracket expressions.
					if (char === '{' || char === '[' || char === '(') {
						this.readBracketed()
					}
					else if (char === ',') {

						// Move to `,|`
						this.offset += 1

						break
					}
					else if (char === '}') {
						break
					}

					// `|/`, not a comment: a sign of division, a JSX closing tag `</div>`,
					// or a regexp. Eat the char like `readBracketed` does, otherwise
					// cursor never moves ahead and the loop never ends.
					else {
						this.offset += 1
					}
				}
			}

			else if (this.state === ScanState.WithinArray) {

				// `{|`
				if (!this.readUntilToMatch(/['"`,\{\]\w\/]/g)) {
					break
				}

				let char = this.peekChar()

				if (this.skipComment()) continue

				// `|'...':`
				if (char === '\'' || char === '"' || char === '`') {

					// Move to `"|`
					this.offset += 1

					this.enterStringState()
				}

				// `|{`
				else if (char === '{') {

					// Move to `{|`
					this.offset += 1

					this.enterState(ScanState.WithinObject)
				}

				else if (/\w/.test(char)) {
					this.enterState(ScanState.WithinVariable)
					this.sync()
				}

				// `|,`
				else if (char === ',') {

					// Move to `,|`
					this.offset += 1
				}

				// `|]`
				else if (char === ']') {

					// Move to `]|`
					this.offset += 1

					this.exitState()
				}
			}
		}
	}

	private *handleClassName(): Iterable<CSSClassInExpressionToken> {

		// `abc|`
		if (!this.readUntilToMatch(/['"`\s\\$]/g)) {
			return
		}

		// Skip `abc${...}`
		let char = this.peekChar()
		if (char === '$') {

			// Move to `$|`
			this.offset += 1

			if (this.peekChar() === '{' && LanguageIds.isScriptSyntax(this.languageId)) {

				// Read until `${...}|`
				if (!this.readBracketed()) {
					return
				}
			}
		}

		// `|\\`, skip next char.
		else if (char === '\\') {

			// Move to `\"|`
			this.offset += 2
		}

		// `|'` or `|"` or `|``.
		else if (char === '\'' || char === '"' || char === '`') {
			if (char === this.quoted) {
				if (!this.stringJoinedRight
					&& (!this.stringJoinedLeft || this.start > this.stringStart)
				) {
					yield this.makeToken(CSSClassInExpressionTokenType.ClassName)
				}
			}
			else {

				// Move after `"|`
				this.offset += 1
			}
		}

		// `|\s`
		else {
			if (!this.stringJoinedLeft || this.start > this.stringStart) {
				yield this.makeToken(CSSClassInExpressionTokenType.ClassName)
			}
		}
	}

	private *handleClassNameSpaces(): Iterable<CSSClassInExpressionToken> {

		// ` |`
		this.readUntilNot(/[\s]/g)

		// At least two spaces.
		if (this.offset - this.start > 1 || this.start === this.stringStart) {
			yield this.makeToken(CSSClassInExpressionTokenType.PotentialClassName, 1, -1)
		}
	}
}
