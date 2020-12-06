import * as path from 'path'
import * as minimatch from 'minimatch'
import * as fs from 'fs-extra'

import {
	DidChangeWatchedFilesParams,
	FileChangeType,
	TextDocuments,
} from 'vscode-languageserver'

import {TextDocument} from 'vscode-languageserver-textdocument'
import * as console from './console'
import {URI} from 'vscode-uri'
import {walkDirectoryToMatchFiles} from './file'


interface FileTrackerItem {

	/** Related document. */
	document: TextDocument | null

	/** 
	 * Document version.
	 * If is 0, means needs to be updated.
	 */
	version: number

	/** if file opened, it can capture it's change event. */
	opened: boolean

	/** Is document content fresh. */
	fresh: boolean

	/**
	 * update request may come from track, or beFresh, we cant makesure they will have no conflict
	 * so we need a promise to lock it to avoid two update task are executed simultaneously.
	 */
	updatePromise: Promise<void> | null
}

/** Specifies whether ignoring files by things specified in these files. */
export type Ignore = '.gitignore' | '.npmignore'

export interface FileTrackerOptions {

	/** Glob pattern of paths of included files. */
	includeFileGlobPattern: string

	/** Glob pattern of paths of  excluded files. */
	excludeGlobPattern?: string

	/** Glob pattern that files matched will always be included even they match `excludeGlobPatterns` or listed in `.gitignore` or `.npmignore`. */
	alwaysIncludeGlobPattern?: string

	/** Ignore files by `.gitignore` or `.npmignore`. */
	ignoreFilesBy?: Ignore[]

	/** Start directory to track files. */
	startPath?: string
}

/** Class to track one type of files in a directory. */
export class FileTracker {

	private documents: TextDocuments<TextDocument>
	private alwaysIncludeGlobPattern: string | null
	private ignoreFilesBy: Ignore[]
	private startPath: string | null

	private includeFileMatcher: minimatch.IMinimatch
	private excludeMatcher: minimatch.IMinimatch | null
	private alwaysIncludeMatcher: minimatch.IMinimatch | null

	private map: Map<string, FileTrackerItem> = new Map()
	private ignoredFilePaths: Set<string> = new Set()
	private allFresh: boolean = true
	private startDataLoaded: boolean = true
	private updating: boolean = false
	private updatePromises: Promise<void>[] | null = null

	constructor(documents: TextDocuments<TextDocument>, options: FileTrackerOptions) {
		this.documents = documents

		this.alwaysIncludeGlobPattern = options.alwaysIncludeGlobPattern || null
		this.ignoreFilesBy = options.ignoreFilesBy || []
		this.includeFileMatcher = new minimatch.Minimatch(options.includeFileGlobPattern)
		this.excludeMatcher = options.excludeGlobPattern ? new minimatch.Minimatch(options.excludeGlobPattern) : null
		this.alwaysIncludeMatcher = this.alwaysIncludeGlobPattern ? new minimatch.Minimatch(this.alwaysIncludeGlobPattern) : null
		this.startPath = options.startPath || null

		if (this.startPath) {
			this.allFresh = false
			this.startDataLoaded = false
		}
	}


	/** When document opened or content changed from vscode editor. */
	onDocumentOpenOrContentChanged(document: TextDocument) {
		if (!this.startDataLoaded) {
			return
		}

		// No need to handle file opening because we have preloaded all the files.
		// Open and changed event will be distinguished by document version later.
		let filePath = URI.parse(document.uri).fsPath

		if (filePath && this.shouldTrackFile(filePath)) {
			this.trackOpenedDocument(document)
		}
	}

	/** After document saved. */
	onDocumentSaved(document: TextDocument) {
		if (!this.startDataLoaded) {
			return
		}

		let filePath = URI.parse(document.uri).fsPath
		let item = this.map.get(filePath)

		// Since `onDidChangeWatchedFiles` event was triggered so frequently, we only do updating after saved.
		if (item && !item.fresh && this.updating) {
			this.updateFile(filePath, item)
		}
	}

	/** After document closed. */
	onDocumentClosed(document: TextDocument) {
		if (!this.startDataLoaded) {
			return
		}

		let filePath = URI.parse(document.uri).fsPath
		let item = this.map.get(filePath)

		if (item) {
			this.retrackClosedFile(filePath)
		}
	}

	/** After changes of files or folders. */
	async onWatchedFileOrFolderChanged(params: DidChangeWatchedFilesParams) {
		// An issue for `@import ...` resources:
		// It's common that we import resources inside `node_modules`,
		// but we can't get notifications when those files changed.
		if (!this.startDataLoaded) {
			return
		}
		
		for (let change of params.changes) {
			let uri = change.uri
			let anyPath = URI.parse(uri).fsPath

			if (!anyPath) {
				continue
			}

			// New file or folder.
			if (change.type === FileChangeType.Created) {
				this.trackFileOrFolder(anyPath)
			}

			// Content changed file or folder.
			else if (change.type === FileChangeType.Changed) {
				let stat = await fs.stat(anyPath)
				if (stat && stat.isFile()) {
					let filePath = anyPath

					if (this.shouldTrackFile(filePath)) {
						this.retrackChangedFile(filePath)
					}
				}
			}

			// Deleted file or folder.
			else if (change.type === FileChangeType.Deleted) {
				this.untrackDeletedFile(anyPath)
			}
		}
	}


	/** Whether tracked file. */
	has(filePath: string): boolean {
		return this.map.has(filePath)
	}

	/** Load all files inside `startPath`, and also all opened documents. */
	private async loadStartData() {
		console.timeStart('track')

		for (let document of this.documents.all()) {
			if (this.shouldTrackFile(URI.parse(document.uri).fsPath)) {
				this.trackOpenedDocument(document)
			}
		}

		await this.trackFileOrFolder(this.startPath!)

		console.timeEnd('track', `${this.map.size} files tracked`)
		this.startDataLoaded = true
	}

	/** Returns whether should track one file. */
	private shouldTrackFile(filePath: string): boolean {
		if (!this.includeFileMatcher.match(filePath)) {
			return false
		}

		if (this.shouldExcludeFileOrFolder(filePath)) {
			return false
		}

		return true
	}

	/** Returns whether should track one file or folder. */
	private shouldTrackFileOrFolder(anyPath: string): boolean {
		if (this.shouldExcludeFileOrFolder(anyPath)) {
			return false
		}

		return true
	}

	/** Returns whether should exclude file or folder. */
	private shouldExcludeFileOrFolder(anyPath: string) {
		if (this.excludeMatcher && this.excludeMatcher.match(anyPath)) {
			if (!this.alwaysIncludeMatcher || !this.alwaysIncludeMatcher.match(anyPath)) {
				return true
			}
		}

		return false
	}

	/** Track file or folder. */
	private async trackFileOrFolder(anyPath: string) {
		if (!this.shouldTrackFileOrFolder(anyPath)) {
			return
		}

		let stat = await fs.stat(anyPath)
		if (stat && stat.isDirectory()) {
			await this.trackFolder(anyPath)
		}
		else if (stat && stat.isFile()) {
			let filePath = anyPath
			if (this.shouldTrackFile(filePath)) {
				this.trackFile(filePath)
			}
		}
	}
	
	/** Track folder. */
	private async trackFolder(folderPath: string) {
		let filePaths = await walkDirectoryToMatchFiles(folderPath, this.includeFileMatcher, this.excludeMatcher, this.ignoreFilesBy, this.alwaysIncludeGlobPattern)

		for (let filePath of filePaths) {
			this.trackFile(filePath)
		}
	}

	/** Track file. */
	protected trackFile(filePath: string) {
		let item = this.map.get(filePath)

		if (!item) {
			item = {
				document: null,
				version: 0,
				opened: false,
				fresh: false,
				updatePromise: null
			}

			this.map.set(filePath, item)
			this.afterTrackedFile(filePath, item)
		}
	}

	/** Track opened file from document, or update tracking, no matter files inside or outside workspace. */
	private trackOpenedDocument(document: TextDocument) {
		let filePath = URI.parse(document.uri).fsPath
		let item = this.map.get(filePath)

		if (item) {
			let fileChanged = document.version > item.version
			item.document = document
			item.version = document.version
			item.opened = true

			if (fileChanged) {
				this.makeFileExpire(filePath, item)
			}
		}
		else {
			item = {
				document,
				version: document.version,
				opened: true,
				fresh: false,
				updatePromise: null
			}

			this.map.set(filePath, item)
			this.afterTrackedFile(filePath, item)
		}
	}

	/** After knows that file expired. */
	private makeFileExpire(filePath: string, item: FileTrackerItem) {
		if (this.updating) {
			this.updateFile(filePath, item)
		}
		else {
			item.fresh = false
			item.version = 0
			this.allFresh = false
			console.log(`${filePath} expired`)
			this.onFileExpired(filePath)
		}
	}

	/** After tracked file, check if it's fresh, if not, set global fresh state or update it. */
	private afterTrackedFile(filePath: string, item: FileTrackerItem) {
		if (this.updating) {
			this.updateFile(filePath, item)
		}
		else if (item) {
			this.allFresh = false
		}

		console.log(`${filePath} tracked`)
		this.onFileTracked(filePath)
	}

	/** Ignore file by path, Still keep data for ignored items. */
	ignore(filePath: string) {
		this.ignoredFilePaths.add(filePath)
		console.log(`${filePath} ignored`)
	}

	/** Stop ignoring file by path. */
	notIgnore(filePath: string) {
		this.ignoredFilePaths.delete(filePath)
		console.log(`${filePath} restored from ignored`)
	}

	/** Check whether ignored file by path. */
	hasIgnored(filePath: string) {
		return this.ignoredFilePaths.size > 0 && this.ignoredFilePaths.has(filePath)
	}

	/** After file content changed, retrack it. */
	private retrackChangedFile(filePath: string) {
		let item = this.map.get(filePath)
		if (item) {
			this.makeFileExpire(filePath, item)
		}
		else {
			this.trackFile(filePath)
		}
	}

	/** retrack closed file. */
	private retrackClosedFile(filePath: string) {
		let item = this.map.get(filePath)
		if (item) {
			// Not been included in `startPath`
			if (this.startPath && !this.startPath.startsWith(filePath)) {
				this.untrackFile(filePath)
			}

			// Becomes same as not opened, still fresh.
			else {
				item.document = null
				item.version = 0
				item.opened = false
				console.log(`${filePath} closed`)
			}
		}
	}

	/** After file or folder deleted from disk. */
	private untrackDeletedFile(deletedPath: string) {
		for (let filePath of this.map.keys()) {
			if (filePath.startsWith(deletedPath)) {
				let item = this.map.get(filePath)
				if (item) {
					this.untrackFile(filePath)
				}
			}
		}

		this.allFresh = false
	}

	/** Delete one file. */
	private untrackFile(filePath: string) {
		this.map.delete(filePath)
					
		if (this.ignoredFilePaths.size > 0) {
			this.ignoredFilePaths.delete(filePath)
		}
		
		console.log(`${filePath} removed`)
		this.onFileUntracked(filePath)
	}

	/** Ensure all the content be fresh. */
	async makeFresh() {
		if (this.allFresh) {
			return
		}

		if (!this.startDataLoaded) {
			await this.loadStartData()
		}

		this.updatePromises = []
		this.updating = true

		console.timeStart('update')

		for (let [filePath, item] of this.map.entries()) {
			if (!item.fresh) {
				this.updateFile(filePath, item)
			}
		}

		// May push more promises even when updating.
		for (let i = 0; i < this.updatePromises.length; i++) {
			let promise = this.updatePromises[i]
			await promise
		}

		let updatedCount = this.updatePromises.length
		console.timeEnd('update', `${updatedCount} files loaded`)

		this.updatePromises = null
		this.updating = false
		this.allFresh = true
	}

	/** Update one file, returns whether updated. */
	private async updateFile(filePath: string, item: FileTrackerItem): Promise<boolean> {
		if (!this.hasIgnored(filePath)) {
			if (!item.updatePromise) {
				item.updatePromise = this.createUpdatePromise(filePath, item)
				this.updatePromises!.push(item.updatePromise)
				await item.updatePromise
				item.updatePromise = null
			}

			return true
		}

		return false
	}

	/** Doing update and returns a promise. */
	private async createUpdatePromise(filePath: string, item: FileTrackerItem) {
		if (!item.document) {
			item.document = await this.loadDocument(filePath)

			if (item.document) {
				item.version = item.document.version
			}
		}
		
		if (item.document) {
			item.fresh = true
			await this.parseDocument(filePath, item.document)

			// Very important, release document memory usage after symbols generated
			if (!item.opened) {
				item.document = null
			}

			console.log(`${filePath} loaded${item.opened ? ' from opened document' : ''}`)
		}
	}

	/** Load text content and create one document. */
	private async loadDocument(filePath: string): Promise<TextDocument | null> {
		let languageId = path.extname(filePath).slice(1).toLowerCase()
		let uri = URI.file(filePath).toString()
		let document = null

		try {
			let text = (await fs.readFile(filePath)).toString('utf8')
			
			// Very low resource usage for creating one document.
			document = TextDocument.create(uri, languageId, 1, text)
		}
		catch (err) {
			console.error(err)
		}

		return document
	}

	/** After file tracked. */
	protected onFileTracked(_filePath: string) {}

	/** After file expired. */
	protected onFileExpired(_filePath: string) {}

	/** After file untracked. */
	protected onFileUntracked(_filePath: string) {}

	/** Parsed document. */
	protected async parseDocument(_filePath: string, _document: TextDocument) {}
}