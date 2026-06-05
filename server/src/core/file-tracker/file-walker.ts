import * as fs from 'fs-extra'
import * as path from 'path'
import {Minimatch} from 'minimatch'


export interface FileWalkerOptions {

	/** Current working directory, default value is `CWD`. */
	currentDir?: string

	/** Ignores file names, default value is `.gitignore`. */
	ignoreFileNames?: string[]

	/** Whether follow symbol links, default value is `false`. */
	followSymbolLinks: boolean

	/** Maximum number of files to traverse, default value is no limit. */
	maxFileCount?: number
}


interface IgnoreRule {
	relDir: string
	match: Minimatch
}


class FileWalker {

	/** Current working directory, default value is `CWD`. */
	private currentDir: string

	/** Ignores file names, default value is `.gitignore`. */
	private ignoreFileNames: string[]

	/** Whether follow symbol links. */
	private followSymbolLinks: boolean

	/** Maximum number of files to traverse. */
	private maxFileCount: number

	constructor (options: FileWalkerOptions) {
		this.currentDir = options.currentDir ?? process.cwd()
		this.ignoreFileNames = options.ignoreFileNames || [ '.gitignore' ]
		this.followSymbolLinks = options.followSymbolLinks ?? false
		this.maxFileCount = options.maxFileCount ?? Infinity
	}

	/** Generate relative paths relative to current directory. */
	async *walk(): AsyncGenerator<string> {
		const count: {value: number} = {value: 0}

		for await(const relPath of this.walkRecursively('', [], count)) {
			yield relPath
		}
	}

	private async *walkRecursively(relDir: string, ignoreRules: IgnoreRule[], count: {value: number}): AsyncGenerator<string> {
		const fileNames = await fs.readdir(path.join(this.currentDir, relDir))

		for (const fileName of fileNames) {
			if (this.isIgnoreFile(fileName)) {

				// Must regenerate array.
				ignoreRules = [...ignoreRules, ...await this.parseIgnoreRules(relDir, fileName)]
			}
		}

		// May parallel to increase speed, but will break generator logic.
		for (const fileName of fileNames) {
			if (count.value >= this.maxFileCount) {
				break
			}

			if (fileName.startsWith('.')) {
				continue
			}

			const relPath = path.join(relDir, fileName)
			const stat = await this.readStat(relPath)

			if (this.matchIgnoreRules(relPath, ignoreRules)) {
				continue
			}

			if (stat.isDirectory()) {
				for await(const subRelPath of this.walkRecursively(relPath, ignoreRules, count)) {
					yield subRelPath
				}
			}
			else {
				yield relPath
				count.value++
			}
		}
	}

	private isIgnoreFile(name: string) {
		return this.ignoreFileNames.includes(name)
	}

	private async readStat(relPath: string): Promise<fs.Stats> {
		const absPath = path.join(this.currentDir, relPath)
		return this.followSymbolLinks ? await fs.stat(absPath) : await fs.lstat(absPath)
	}

	private async parseIgnoreRules(relDir: string, fileName: string): Promise<IgnoreRule[]> {
		const absPath = path.join(this.currentDir, relDir, fileName)
		const text = await fs.readFile(absPath, 'utf8')

		const globOptions = {
			matchBase: true,
			dot: true,
			flipNegate: true,
			nocase: true,
		}

		const ruleLines = text.split(/\r?\n/)
			.filter(line => !/^#|^$/.test(line.trim()))

		// Here it doesn't supports expressions like `!XXX`.
		const rules = ruleLines.map(pattern => {
			if (pattern.startsWith('/')) {
				pattern = pattern.slice(1)
			}
			else {
				pattern = '{**/,}' + pattern
			}

			if (pattern.endsWith('/')) {
				pattern = pattern.replace(/\/$/, '{/**,}')
			}
			
			return {
				relDir,
				match: new Minimatch(pattern, globOptions),
			}
		})
		
		return rules
	}

	private matchIgnoreRules(relPath: string, ignoreRules: IgnoreRule[]) {
		for (const rule of ignoreRules) {
			const pathRelToRule = path.relative(rule.relDir, relPath)

			if (rule.match.match(pathRelToRule)) {
				return true
			}
		}

		return false
	}
}



/** Will walk the file paths, generate each absolute paths, not include folder path. */
export async function* walkDirectoryToMatchFiles(
	currentDir: string,
	ignoreFileNames: string[],
	maxFileCount: number = Infinity
): AsyncGenerator<string> {
	const walker = new FileWalker({
		currentDir,
		ignoreFileNames,
		followSymbolLinks: false,
		maxFileCount,
	})

	for await(const relPath of walker.walk()) {
		yield path.join(currentDir, relPath)
	}
}

