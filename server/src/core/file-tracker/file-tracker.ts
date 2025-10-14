import * as path from 'path'
import * as fs from 'fs-extra'
import {DidChangeWatchedFilesParams, FileChangeType, TextDocuments, RemoteWindow} from 'vscode-languageserver'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {Logger} from '../logger'
import {URI} from 'vscode-uri'
import {walkDirectoryToMatchFiles} from './file-walker'
import {TrackingMap, TrackingReasonMask} from './tracking-map'
import {TrackingTest} from './tracking-test'
import {fetchAsText} from '../../utils'
import {GlobPathSharer} from './glob-path-sharer'


/** Specifies whether ignoring files by things specified in these files. */
export type Ignore = '.gitignore' | '.npmignore'

export interface FileTrackerOptions {

	/** Glob pattern of paths of included files. */
	includeFileGlobPattern: string

	/** Glob pattern of paths of  excluded files. */
	excludeGlobPattern?: string

	/** Glob pattern that files matched will always be included even they match `excludeGlobPatterns` or listed in `.gitignore` or `.npmignore`. */
	alwaysIncludeGlobSharer?: GlobPathSharer

	/** Ignore files by `.gitignore` or `.npmignore`. */
	ignoreFilesBy?: Ignore[]

	/** Start directory to track files. */
	startPath?: string

	/** Most count of files to track, default value is `Infinity`. */
	mostFileCount?: number

	/** If not use service after some milliseconds, release all resources. */
	releaseTimeoutMs?: number
}

/** Clean long-unused imported only or no reason sources every 5 mins. */
const CheckUnUsedTimeInterval =  5 * 60 * 1000


/** Class to track one type of files in a directory. */
export abstract class FileTracker {

	readonly documents: TextDocuments<TextDocument>
	readonly window: RemoteWindow
	readonly startPath: string | null
	readonly alwaysIncludeGlobSharer: GlobPathSharer | null
	readonly ignoreFilesBy: Ignore[]
	readonly mostFileCount: number
	readonly releaseTimeoutMs: number
	readonly trackingMap: TrackingMap = new TrackingMap()

	protected abstract identifier: string
	protected test: TrackingTest
	protected startDataLoaded: boolean = true
	protected updating: Promise<void> | null = null
	protected releaseTimeout: NodeJS.Timeout | null = null
	protected releaseImportedTimeout: NodeJS.Timeout | null = null

	/**
	 * update request may come from track, or beFresh, we cant make sure they will have no conflict
	 * so we need a promise to lock it to avoid two update task are executed simultaneously.
	 */
	protected updatePromiseMap: Map<string, Promise<void>> = new Map()

	constructor(documents: TextDocuments<TextDocument>, window: RemoteWindow, options: FileTrackerOptions) {
		this.documents = documents
		this.window = window
		this.startPath = options.startPath || null
		this.alwaysIncludeGlobSharer = options.alwaysIncludeGlobSharer || null
		this.ignoreFilesBy = options.ignoreFilesBy || []
		this.mostFileCount = options.mostFileCount ?? Infinity
		this.releaseTimeoutMs = options.releaseTimeoutMs ?? Infinity

		this.test = new TrackingTest(options)

		if (this.startPath) {
			this.startDataLoaded = false
		}

		// Clean long-unused imported only sources every 5mins.
		setInterval(this.clearImportedOnlyResources.bind(this), CheckUnUsedTimeInterval)
	}

	/** When document opened or content changed from vscode editor. */
	onDocumentOpenOrContentChanged(document: TextDocument) {

		// No need to handle file opening because we have preloaded all the files.
		// Open and changed event will be distinguished by document version later.
		if (this.trackingMap.has(document.uri) || this.test.shouldTrackURI(document.uri)) {
			this.trackOpenedDocument(document)
		}
	}

	/** After document saved. */
	onDocumentSaved(document: TextDocument) {
		let fresh = this.trackingMap.isFresh(document.uri)

		// Since `onDidChangeWatchedFiles` event was triggered so frequently, we only do updating after saved.
		if (!fresh && this.updating) {
			this.updateURI(document.uri)
		}
	}

	/** After document closed. */
	onDocumentClosed(document: TextDocument) {
		if (this.trackingMap.has(document.uri)) {
			this.afterFileClosed(document.uri)
		}
	}

	/** After changes of files or folders. */
	async onWatchedFileOrFolderChanged(params: DidChangeWatchedFilesParams) {
		for (let change of params.changes) {
			let uri = change.uri
			let fsPath = URI.parse(uri).fsPath

			// New file or folder.
			if (change.type === FileChangeType.Created) {

				// If haven't loaded whole workspace, no need to load newly created.
				// An issue for `@import ...` resources:
				// It's common that we import resources inside `node_modules`,
				// but we can't get notifications when those files changed outside of vscode.
				if (!this.startDataLoaded) {
					return
				}

				this.tryTrackFileOrFolder(fsPath, TrackingReasonMask.Included)
			}

			// File or folder that content changed.
			else if (change.type === FileChangeType.Changed) {
				if (await fs.pathExists(fsPath)) {
					let stat = await fs.stat(fsPath)
					if (stat && stat.isFile()) {
						if (this.test.shouldTrackPath(fsPath)) {
							this.trackPath(fsPath, TrackingReasonMask.Included)
						}
					}
				}
			}

			// Deleted file or folder.
			else if (change.type === FileChangeType.Deleted) {
				this.afterDirDeleted(uri)
			}
		}
	}


	/** Track file or folder. */
	private async tryTrackFileOrFolder(fsPath: string, reason: TrackingReasonMask) {
		if (this.test.shouldExcludePath(fsPath)) {
			return
		}

		if (!await fs.pathExists(fsPath)) {
			return
		}

		let stat = await fs.stat(fsPath)
		if (stat.isDirectory()) {
			await this.tryTrackFolder(fsPath, reason)
		}
		else if (stat.isFile()) {
			let filePath = fsPath
			if (this.test.shouldTrackPath(filePath)) {
				this.trackPath(filePath, reason)
			}
		}
	}
	
	/** Track folder. */
	private async tryTrackFolder(folderPath: string, reason: TrackingReasonMask) {
		let filePathsGenerator = walkDirectoryToMatchFiles(folderPath, this.ignoreFilesBy)
		let count = 0

		for await (let absPath of filePathsGenerator) {
			if (this.test.shouldTrackPath(absPath)) {
				this.trackPath(absPath, reason)
				count++

				if (count >= this.mostFileCount) {
					this.window.showWarningMessage(`CSS Navigation limits scanning at most "${this.mostFileCount}" files for performance reason!`)
					break
				}
			}
		}
	}

	/** Track more uri, normally imported uri. */
	trackMoreURI(uri: string, reason: TrackingReasonMask | 0 = 0) {
		this.trackURI(uri, reason)
	}

	/** Track or re-track file by file path, not validate whether should track here. */
	private trackPath(filePath: string, reason: TrackingReasonMask | 0) {
		let uri = URI.file(filePath).toString()
		this.trackURI(uri, reason)
	}

	/** Track or re-track by uri, not validate whether should track here. */
	private trackURI(uri: string, reason: TrackingReasonMask | 0) {
		let hasTracked = this.trackingMap.has(uri)
		this.trackingMap.trackByReason(uri, reason)

		if (!hasTracked) {
			this.afterNewFileTracked(uri)
		}
	}

	/** Untrack a file by uri. */
	protected untrackURI(uri: string) {
		this.trackingMap.delete(uri)
		this.afterFileUntracked(uri)
	}

	/** Track or re-track opened file from document, or update tracking, no matter files inside or outside workspace. */
	trackOpenedDocument(document: TextDocument) {
		let uri = document.uri
		let hasTracked = this.trackingMap.has(uri)
		let freshBefore = this.trackingMap.isFresh(uri)

		this.trackingMap.trackByDocument(document)
		let freshAfter = this.trackingMap.isFresh(uri)
		let expired = freshBefore && !freshAfter

		if (expired) {
			this.afterFileExpired(uri)
		}
		else if (!hasTracked) {
			this.afterNewFileTracked(uri)
		}
	}


	/** After tracked a new file, will check if it's fresh. */
	private afterNewFileTracked(uri: string) {
		this.onFileTracked(uri)

		if (this.updating) {
			this.updateURI(uri)
		}
	}

	/** After file or folder deleted from disk. */
	private afterDirDeleted(deletedURI: string) {
		for (let uri of this.trackingMap.getURIs()) {
			if (uri.startsWith(deletedURI)) {
				this.untrackURI(uri)
			}
		}
	}

	/** After knows that file get expired. */
	private afterFileExpired(uri: string) {
		Logger.log(`✏️ ${decodeURIComponent(uri)} expired`)
		this.onFileExpired(uri)

		if (this.updating) {
			this.updateURI(uri)
		}
	}

	/** After file get closed, decide whether untrack it. */
	private afterFileClosed(uri: string) {
		this.trackingMap.removeReason(uri, TrackingReasonMask.Opened)

		if (!this.trackingMap.has(uri)) {
			this.afterFileUntracked(uri)
		}
	}

	/** After removed file from tracking. */
	private afterFileUntracked(uri: string) {
		Logger.log(`🗑️ ${decodeURIComponent(uri)} removed`)
		this.onFileUntracked(uri)
	}

	/** After file tracked. */
	protected onFileTracked(_uri: string) {}

	/** After file expired. */
	protected onFileExpired(_uri: string) {}

	/** After file untracked. */
	protected onFileUntracked(_uri: string) {}



	/** Ensure all the content be fresh. */
	async beFresh() {
		if (this.trackingMap.allFresh) {
			return
		}

		if (this.updating) {
			await this.updating
		}
		else {
	
			this.updating = this.doUpdating()
			await this.updating
			this.updating = null
			this.trackingMap.setAllFresh(true)
		}

		this.resetReleaseTimeout()
	}

	/** 
	 * Ensure specified content be fresh, if it has been included.
	 * Normally use this only for imported sources.
	 */
	async uriBeFresh(uri: string) {
		if (!this.trackingMap.has(uri)) {
			return
		}

		if (!this.trackingMap.isFresh(uri)) {
			await this.updateURI(uri)
		}
	}

	/** Update all the contents that need to be updated. */
	private async doUpdating() {
		if (!this.startDataLoaded) {
			await this.loadStartData()
		}

				
		Logger.timeStart(this.identifier + '-update')

		for (let uri of this.trackingMap.getURIs()) {
			if (!this.trackingMap.isFresh(uri)) {

				// Note here not wait it.
				this.updateURI(uri)
			}
		}

		let loopCount = 0
		let updatedFileCount = 0

		// May track more files and push more promises when updating.
		while (this.updatePromiseMap.size > 0 && loopCount++ < 10) {
			let allPromises = [...this.updatePromiseMap.values()]

			for (let promise of allPromises) {
				await promise
			}

			updatedFileCount += allPromises.length
			await Promise.resolve()
		}

		this.onAfterUpdated()
		Logger.timeEnd(this.identifier + '-update', updatedFileCount > 0 ? `${updatedFileCount} files loaded` : null)
	}

	/** Do more after updated. */
	protected onAfterUpdated() {}

	/** Load all files inside `startPath` and `alwaysIncludeGlobPattern`, and also all opened documents. */
	private async loadStartData() {
		Logger.timeStart(this.identifier + '-track')

		for (let document of this.documents.all()) {
			if (this.test.shouldTrackURI(document.uri)) {
				this.trackOpenedDocument(document)
			}
		}

		if (this.alwaysIncludeGlobSharer) {
			let alwaysIncludePaths = await this.alwaysIncludeGlobSharer.get()

			for (let filePath of alwaysIncludePaths) {

				// Normalize it.
				filePath = URI.file(filePath).fsPath

				if (this.test.shouldIncludePath(filePath)) {
					this.trackPath(filePath, TrackingReasonMask.Included)
				}
			}
		}

		await this.tryTrackFileOrFolder(this.startPath!, TrackingReasonMask.Included)

		Logger.timeEnd(this.identifier + '-track', `${this.trackingMap.size()} files tracked`)
		this.startDataLoaded = true
	}

	/** Update one file, returns whether updated. */
	private async updateURI(uri: string): Promise<boolean> {
		let promise = this.updatePromiseMap.get(uri)
		if (promise) {
			await promise
		}
		else {
			promise = this.doingUpdateURI(uri)
			this.updatePromiseMap.set(uri, promise)

			await promise
			this.updatePromiseMap.delete(uri)
		}

		return true
	}

	/** Doing update and returns a promise. */
	private async doingUpdateURI(uri: string) {
		if (!this.trackingMap.has(uri)) {
			return
		}

		let document = this.trackingMap.getDocument(uri)
		if (!document) {
			document = await this.loadDocument(uri)
			this.trackingMap.setDocument(uri, document)
		}

		if (document) {
			await this.parseDocument(uri, document)
			this.trackingMap.setFresh(uri, true)
			Logger.log(`📃 ${decodeURIComponent(uri)} loaded`)
		}
	}

	/** Load text content and create one document. */
	protected async loadDocument(uri: string): Promise<TextDocument | null> {
		let languageId = path.extname(uri).slice(1).toLowerCase()
		let document: TextDocument | null = null
		let protocol = URI.parse(uri).scheme

		if (protocol === 'http' || protocol === 'https') {
			try {
				
				// Use private uri protocol to open remote files.
				let myURI = 'css-nav-uri:' + uri

				let text = await fetchAsText(uri)
				document = TextDocument.create(myURI, languageId, 1, text)
			}
			catch (err) {
				console.error(err)
			}
		}
		else if (protocol === 'file') {
			try {
				let text = (await fs.readFile(URI.parse(uri).fsPath)).toString('utf8')
				document = TextDocument.create(uri, languageId, 1, text)
			}
			catch (err) {
				console.error(err)
			}
		}

		return document
	}

	/** Parsed document by the way you need. */
	protected async parseDocument(_uri: string, _document: TextDocument) {}



	/** Reset release timeout if needed. */
	protected resetReleaseTimeout() {
		if (this.releaseTimeout) {
			clearTimeout(this.releaseTimeout)
		}

		if (isFinite(this.releaseTimeoutMs)) {
			this.releaseTimeout = setTimeout(this.releaseResources.bind(this), this.releaseTimeoutMs)
		}
	}

	/** Release all resources. */
	protected releaseResources() {
		let size = this.trackingMap.size()
		if (size === 0) {
			return
		}

		this.startDataLoaded = false
		this.trackingMap.clear()

		Logger.log(`⏰ All ${size} long-unused resources released`)
		this.onReleaseResources()
	}

	protected onReleaseResources() {}

	/** Clean imported only resource. */
	protected clearImportedOnlyResources() {
		let timestamp = Logger.getTimestamp() - CheckUnUsedTimeInterval
		let uris = [...this.trackingMap.walkInActiveAndExpiredURIs(timestamp)]

		if (uris.length === 0) {
			return
		}

		for (let uri of uris) {
			this.untrackURI(uri)
		}

		Logger.log(`⏰ ${uris.length} long-unused imported only resources released`)
	}
}