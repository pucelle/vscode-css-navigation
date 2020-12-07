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
import {glob} from 'glob'
import {promisify} from 'util'


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
		if (this.shouldTrackFile(URI.parse(document.uri).fsPath)) {
			this.trackOpenedDocument(document)
		}
	}

	/** After document saved. */
	onDocumentSaved(document: TextDocument) {
		if (!this.startDataLoaded) {
			return
		}

		let item = this.map.get(document.uri)

		// Since `onDidChangeWatchedFiles` event was triggered so frequently, we only do updating after saved.
		if (item && !item.fresh && this.updating) {
			this.updateFile(document.uri, item)
		}
	}

	/** After document closed. */
	onDocumentClosed(document: TextDocument) {
		if (!this.startDataLoaded) {
			return
		}

		let item = this.map.get(document.uri)

		if (item) {
			this.retrackClosedFile(document.uri)
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
			let fsPath = URI.parse(uri).fsPath

			// New file or folder.
			if (change.type === FileChangeType.Created) {
				this.trackFileOrFolder(fsPath)
			}

			// Content changed file or folder.
			else if (change.type === FileChangeType.Changed) {
				if (await fs.pathExists(fsPath)) {
					let stat = await fs.stat(fsPath)
					if (stat && stat.isFile()) {
						if (this.shouldTrackFile(fsPath)) {
							this.retrackChangedFile(uri)
						}
					}
				}
			}

			// Deleted file or folder.
			else if (change.type === FileChangeType.Deleted) {
				this.untrackDeletedFile(uri)
			}
		}
	}


	/** Whether tracked file. */
	has(uri: string): boolean {
		return this.map.has(uri)
	}

	/** Load all files inside `startPath`, and also all opened documents. */
	private async loadStartData() {
		console.timeStart('track')

		for (let document of this.documents.all()) {
			if (this.shouldTrackFile(URI.parse(document.uri).fsPath)) {
				this.trackOpenedDocument(document)
			}
		}

		if (this.alwaysIncludeGlobPattern) {
			let alwaysIncludePaths = await promisify(glob)(this.alwaysIncludeGlobPattern, {
				cwd: this.startPath || undefined,
				absolute: true,
			})

			for (let filePath of alwaysIncludePaths) {
				filePath = URI.file(filePath).fsPath

				if (this.shouldTrackFile(filePath)) {
					this.trackFile(filePath)
				}
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
	private shouldTrackFileOrFolder(fsPath: string): boolean {
		if (this.shouldExcludeFileOrFolder(fsPath)) {
			return false
		}

		return true
	}

	/** Returns whether should exclude file or folder. */
	private shouldExcludeFileOrFolder(fsPath: string) {
		if (this.alwaysIncludeMatcher && this.alwaysIncludeMatcher.match(fsPath)) {
			return false
		}

		if (this.excludeMatcher && this.excludeMatcher.match(fsPath)) {
			return true
		}

		return false
	}

	/** Track file or folder. */
	private async trackFileOrFolder(fsPath: string) {
		if (!this.shouldTrackFileOrFolder(fsPath)) {
			return
		}

		if (!await fs.pathExists(fsPath)) {
			return
		}

		let stat = await fs.stat(fsPath)
		if (stat.isDirectory()) {
			await this.trackFolder(fsPath)
		}
		else if (stat.isFile()) {
			let filePath = fsPath
			if (this.shouldTrackFile(filePath)) {
				this.trackFile(filePath)
			}
		}
	}
	
	/** Track folder. */
	private async trackFolder(folderPath: string) {
		let filePaths = await walkDirectoryToMatchFiles(folderPath, this.includeFileMatcher, this.excludeMatcher, this.ignoreFilesBy)

		for (let filePath of filePaths) {
			filePath = URI.file(filePath).fsPath
			this.trackFile(filePath)
		}
	}

	/** Track file. */
	private trackFile(filePath: string) {
		let uri = URI.file(filePath).toString()
		let item = this.map.get(uri)

		if (!item) {
			item = {
				document: null,
				version: 0,
				opened: false,
				fresh: false,
				updatePromise: null
			}

			this.map.set(uri, item)
			this.afterTrackedFile(uri, item)
		}
	}

	/** Track more file like imported file. although it may not in `startPath`. */
	trackMoreFile(filePath: string) {
		if (this.includeFileMatcher.match(filePath)) {
			this.trackFile(filePath)
		}
	}

	/** Track opened file from document, or update tracking, no matter files inside or outside workspace. */
	private trackOpenedDocument(document: TextDocument) {
		let uri = document.uri
		let item = this.map.get(uri)

		if (item) {
			let fileChanged = document.version > item.version
			item.document = document
			item.version = document.version
			item.opened = true

			if (fileChanged) {
				this.makeFileExpire(uri, item)
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

			this.map.set(uri, item)
			this.afterTrackedFile(uri, item)
		}
	}

	/** After knows that file expired. */
	private makeFileExpire(uri: string, item: FileTrackerItem) {
		if (this.updating) {
			this.updateFile(uri, item)
		}
		else {
			item.fresh = false
			item.version = 0
			this.allFresh = false
			console.log(`${uri} expired`)
			this.onFileExpired(uri)
		}
	}

	/** After tracked file, check if it's fresh, if not, set global fresh state or update it. */
	private afterTrackedFile(uri: string, item: FileTrackerItem) {
		if (this.updating) {
			this.updateFile(uri, item)
		}
		else if (item) {
			this.allFresh = false
		}

		console.log(`${uri} tracked`)
		this.onFileTracked(uri)
	}

	/** Ignore file by path, Still keep data for ignored items. */
	ignore(uri: string) {
		this.ignoredFilePaths.add(uri)
		console.log(`${uri} ignored`)
	}

	/** Stop ignoring file by path. */
	notIgnore(uri: string) {
		this.ignoredFilePaths.delete(uri)
		console.log(`${uri} restored from ignored`)
	}

	/** Check whether ignored file by path. */
	hasIgnored(uri: string) {
		return this.ignoredFilePaths.size > 0 && this.ignoredFilePaths.has(uri)
	}

	/** After file content changed, retrack it. */
	private retrackChangedFile(uri: string) {
		let item = this.map.get(uri)
		if (item) {
			// Alread been handled by document change event.
			let openedAndFresh = item.document && item.version === item.document.version
			if (!openedAndFresh) {
				this.makeFileExpire(uri, item)
			}
		}
		else {
			this.trackFile(uri)
		}
	}

	/** retrack closed file. */
	private retrackClosedFile(uri: string) {
		let item = this.map.get(uri)
		if (item) {
			// Becomes same as not opened, still fresh.
			item.document = null
			item.version = 0
			item.opened = false
			console.log(`${uri} closed`)
		}
	}

	/** After file or folder deleted from disk. */
	private untrackDeletedFile(deletedURI: string) {
		for (let uri of this.map.keys()) {
			if (uri.startsWith(deletedURI)) {
				let item = this.map.get(uri)
				if (item) {
					this.untrackFile(uri)
				}
			}
		}

		this.allFresh = false
	}

	/** Delete one file. */
	private untrackFile(uri: string) {
		this.map.delete(uri)
					
		if (this.ignoredFilePaths.size > 0) {
			this.ignoredFilePaths.delete(uri)
		}
		
		console.log(`${uri} removed`)
		this.onFileUntracked(uri)
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

		for (let [uri, item] of this.map.entries()) {
			if (!item.fresh) {
				this.updateFile(uri, item)
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
	private async updateFile(uri: string, item: FileTrackerItem): Promise<boolean> {
		if (!this.hasIgnored(uri)) {
			if (!item.updatePromise) {
				item.updatePromise = this.createUpdatePromise(uri, item)
				this.updatePromises!.push(item.updatePromise)
				await item.updatePromise
				item.updatePromise = null
			}

			return true
		}

		return false
	}

	/** Doing update and returns a promise. */
	private async createUpdatePromise(uri: string, item: FileTrackerItem) {
		if (!item.document) {
			item.document = await this.loadDocument(uri)

			if (item.document) {
				item.version = item.document.version
			}
		}
		
		if (item.document) {
			item.fresh = true
			await this.parseDocument(uri, item.document)

			// Very important, release document memory usage after symbols generated
			if (!item.opened) {
				item.document = null
			}

			console.log(`${uri} loaded${item.opened ? ' from opened document' : ''}`)
		}
	}

	/** Load text content and create one document. */
	private async loadDocument(uri: string): Promise<TextDocument | null> {
		let languageId = path.extname(uri).slice(1).toLowerCase()
		let document = null

		try {
			let text = (await fs.readFile(URI.parse(uri).fsPath)).toString('utf8')
			
			// Very low resource usage for creating one document.
			document = TextDocument.create(uri, languageId, 1, text)
		}
		catch (err) {
			console.error(err)
		}

		return document
	}

	/** After file tracked. */
	protected onFileTracked(_uri: string) {}

	/** After file expired. */
	protected onFileExpired(_uri: string) {}

	/** After file untracked. */
	protected onFileUntracked(_uri: string) {}

	/** Parsed document. */
	protected async parseDocument(_uri: string, _document: TextDocument) {}
}