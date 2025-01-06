export namespace LanguageIds {
	export function isHTMLSyntax(languageId: AllLanguageId): boolean {
		return languageId === 'html'
			|| languageId === 'jsx'
			|| languageId === 'tsx'
			|| languageId === 'js'
			|| languageId === 'ts'
	}

	export function isCSSSyntax(languageId: AllLanguageId): boolean {
		return languageId === 'css'
			|| languageId === 'sass'
			|| languageId === 'scss'
			|| languageId === 'less'
	}

	export function isScssLessSyntax(languageId: AllLanguageId): boolean {
		return languageId === 'sass'
			|| languageId === 'scss'
			|| languageId === 'less'
	}

	export function isScriptSyntax(languageId: AllLanguageId): boolean {
		return isHTMLSyntax(languageId) && languageId !== 'html'
	}

	export function isReactScriptSyntax(languageId: AllLanguageId): boolean {
		return languageId === 'jsx' || languageId === 'tsx'
	}
}