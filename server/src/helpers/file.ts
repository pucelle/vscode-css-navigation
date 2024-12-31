import * as path from 'path'


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