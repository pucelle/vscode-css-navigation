import * as path from 'path'


export function getPathExtension(filePath: string): string {
	return path.extname(filePath).slice(1).toLowerCase()
}


export function replacePathExtension(filePath: string, toExtension: string): string {
	return filePath.replace(/\.\w+$/, '.' + toExtension)
}


export function isCSSLikePath(filePath: string): boolean {
	return ['css', 'less', 'scss', 'sass'].includes(getPathExtension(filePath))
}