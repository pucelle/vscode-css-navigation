import {glob} from 'glob'
import {promisify} from 'util'
import * as minimatch from 'minimatch'


/** Just for sharing glob query result. */
export class GlobPathSharer {

	readonly pattern: string
	readonly fromPath: string
	private cachedResult: string[] | null = null
	private matcher: minimatch.IMinimatch

	constructor(pattern: string, fromPath: string) {
		this.pattern = pattern
		this.fromPath = fromPath
		this.matcher = new minimatch.Minimatch(this.pattern)
	}

	match(fsPath: string) {
		return this.matcher.match(fsPath)
	}

	async get() {
		if (this.cachedResult) {
			return this.cachedResult
		}

		this.cachedResult = await promisify(glob)(this.pattern, {
			cwd: this.fromPath || undefined,
			absolute: true,
		})

		return this.cachedResult
	}
}