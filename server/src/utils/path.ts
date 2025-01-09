import * as path from 'path'


/** Get longest common subsequence length of two paths. */
export function getLongestCommonSubsequenceLength(a: string, b: string): number {
	let m = a.length
	let n = b.length
	let len = Math.min(m, n)

	for (let i = 0; i < len; i++) {
		if (a[i] !== b[i]) {
			return i
		}
	}

	return len
}


export function generateGlobPatternByPatterns(patterns: string[]): string | null {
	if (patterns.length > 1) {
		return '{' + patterns.join(',') + '}'
	}
	else if (patterns.length === 1) {
		return patterns[0]
	}

	return null
}

export function generateGlobPatternByExtensions(extensions: string[]): string | null {
	if (extensions.length > 1) {
		return '**/*.{' + extensions.join(',') + '}'
	}
	else if (extensions.length === 1) {
		return '**/*.' + extensions[0]
	}

	return null
}


export function getPathExtension(filePath: string): string {
	return path.extname(filePath).slice(1).toLowerCase()
}


export function replacePathExtension(filePath: string, toExtension: string): string {
	return filePath.replace(/\.\w+$/, '.' + toExtension)
}


export function isCSSLikePath(filePath: string): boolean {
	return ['css', 'less', 'scss', 'sass'].includes(getPathExtension(filePath))
}