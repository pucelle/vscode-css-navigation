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

	private stringStartStack: number[] = []

	/** 
	 * If can knows that current string is absolute an expression,
	 * no bracket marker like `{...}`,
	 * like x-bind:class=`variable ? a : b`,
	 * or :class=`{prop: boolean}`
	 */
	constructor(string: string, scannerStart: number = 0, languageId: AllLanguageId, alreadyAnExpression: boolean) {
		super(string, scannerStart, languageId)

		if (alreadyAnExpression) {
			this.enterState(ScanState.WithinExpression)
		}
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
		this.enterState(ScanState.WithinString)
	
		if (this.stringStart > -1) {
			this.stringStartStack.push(this.stringStart)
		}

		this.stringStart = this.offset
	}

	exitStringState() {
		this.exitState()
		this.stringStart = this.stringStartStack.pop()!
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
				if (!this.readUntilToMatch(/['"`{$]/g)) {
					break
				}

				let char = this.peekChar()

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
				if (!this.readUntilToMatch(/['"`\\\w${\s]/g)) {
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

				if (!this.readUntilToMatch(/['"`{\[\w\}]/g)) {
					break
				}

				let char = this.peekChar()

				// `|'` or `|"` or `|``
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

				this.exitState()
			}

			else if (this.state === ScanState.WithinObject) {

				// `{|`
				if (!this.readUntilToMatch(/[\w'"`}]/g)) {
					break
				}

				let char = this.peekChar()

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
					if (!this.readUntilToMatch(/[\{\[\(,}]/g)) {
						break
					}

					char = this.peekChar()

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
				}
			}

			else if (this.state === ScanState.WithinArray) {

				// `{|`
				if (!this.readUntilToMatch(/['"`,\{\]]/g)) {
					break
				}

				let char = this.peekChar()

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
				yield this.makeToken(CSSClassInExpressionTokenType.ClassName)
			}
			else {

				// Move after `"|`
				this.offset += 1
			}
		}

		// `|\s`
		else {
			yield this.makeToken(CSSClassInExpressionTokenType.ClassName)
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