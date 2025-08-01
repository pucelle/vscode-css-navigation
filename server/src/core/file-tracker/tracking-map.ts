import {TextDocument} from 'vscode-languageserver-textdocument'
import {TwoWayListMap} from '../../utils'


interface FileTrackerItem {

	/** Related document, exist for only opened reason. */
	document: TextDocument | null

	/** 
	 * Document version.
	 * If is 0, means needs to be updated.
	 */
	version: number

	/** Union of byte mask of `TrackReason`. */
	reason: TrackingReasonMask | 0

	/** Latest used time, use it only for imported reason. */
	latestUseTime: number

	/** if file opened, it can capture it's change event. */
	opened: boolean

	/** Is document content fresh. */
	fresh: boolean
}

export enum TrackingReasonMask {

	/** Included in workspace and not been ignored. */
	Included = 1,

	/** As opened document. */
	Opened = 2,

	/** 
	 * As imported document.
	 * When been imported, or ancestrally imported by any included or opened.
	 */
	Imported = 4,

	/** 
	 * Force imported always.
	 * Use it when been imported by a html document.
	 */
	ForceImported = 8,
}


export class TrackingMap {

	private trackingMap: Map<string, FileTrackerItem> = new Map()

	/** URI <-> Imported URI. */
	private importMap: TwoWayListMap<string, string> = new TwoWayListMap()

	/** Whether all be fresh. */
	allFresh: boolean = false

	size(): number {
		return this.trackingMap.size
	}

	getURIs(): string[] {
		return [...this.trackingMap.keys()]
	}
	
	/** Walk all included and opened, or imported uris. */
	*walkActiveURIs(): Iterable<string> {
		for (let [uri, item] of this.trackingMap) {
			if (item.reason > 0) {
				yield uri
			}
		}
	}

	/** Walk imported only, or has no reason uris, which are also expired. */
	*walkInActiveAndExpiredURIs(beforeTimestamp: number): Iterable<string> {
		for (let [uri, item] of this.trackingMap) {
			if (item.reason === 0 && item.latestUseTime < beforeTimestamp) {
				yield uri
			}
		}
	}

	/** Get resolved import uris, and all their imported recursively. */
	resolveChainedImportedURIs(uris: string[]): Iterable<string> {
		let set: Set<string> = new Set()
		this.resolveChainedImportedCSSPathsBySet(uris, set)

		return set
	}

	private resolveChainedImportedCSSPathsBySet(uris: string[], set: Set<string>) {
		for (let uri of uris) {
			if (set.has(uri)) {
				continue
			}

			set.add(uri)

			let imported = this.importMap.getByLeft(uri)
			if (imported) {
				this.resolveChainedImportedCSSPathsBySet(imported, set)
			}
		}
	}
	
	has(uri: string): boolean {
		return this.trackingMap.has(uri)
	}

	isFresh(uri: string): boolean {
		let item = this.trackingMap.get(uri)
		if (!item) {
			return false
		}

		return item.fresh
	}

	/** Must ensure uri existing. */
	setFresh(uri: string, fresh: boolean) {
		this.trackingMap.get(uri)!.fresh = fresh
	}

	/** Must ensure uri existing. */
	getDocument(uri: string): TextDocument | null {
		return this.trackingMap.get(uri)!.document
	}

	/** 
	 * Must ensure uri existing.
	 * Only opened document get cached.
	 */
	setDocument(uri: string, document: TextDocument | null) {
		let item = this.trackingMap.get(uri)!

		if (item.reason & TrackingReasonMask.Opened) {
			item.document = document
		}

		if (document) {
			item.version = document.version
		}
	}

	/** Must ensure uri existing. */
	setUseTime(uri: string, time: number) {
		this.trackingMap.get(uri)!.latestUseTime = time
	}

	setAllFresh(fresh: boolean) {
		this.allFresh = fresh
	}

	getReason(uri: string): TrackingReasonMask | 0 | undefined {
		return this.trackingMap.get(uri)?.reason
	}

	/** Suggest to track both, then add import relationship. */
	setImported(imported: string[], from: string) {
		let changed = new Set(this.importMap.getByLeft(from))

		for (let uri of imported) {
			changed.add(uri)
		}

		this.importMap.replaceLeft(from, imported)

		for (let uri of changed) {
			this.checkImportedRecursively(uri)
		}
	}

	/** Validate after reason of `uri`, or ancestrally imported changed. */
	private checkImportedRecursively(uri: string, depth = 5) {
		let item = this.trackingMap.get(uri)
		if (!item) {
			return
		}

		// A imports B, B imports C
		// A gets Included, then B gets Imported, then C gets Imported

		if (this.isImportedAncestrally(uri)) {
			item.reason |= TrackingReasonMask.Imported
		}
		else {
			item.reason &= ~TrackingReasonMask.Imported
		}

		// Validate all imported reason to imported recursively.
		if (depth > 0) {
			let importURIs = this.importMap.getByLeft(uri)
			if (importURIs) {
				for (let importURI of importURIs) {
					this.checkImportedRecursively(importURI, depth - 1)
				}
			}
		}
	}

	/** Test whether been imported, or ancestrally imported by any included or opened. */
	private isImportedAncestrally(uri: string, depth: number = 5): boolean {
		let item = this.trackingMap.get(uri)
		if (!item) {
			return false
		}

		let fromURIs = this.importMap.getByRight(uri)
		if (!fromURIs) {
			return false
		}

		if (depth === 0) {
			return false
		}

		for (let fromURI of fromURIs) {
			let fromItem = this.trackingMap.get(fromURI)!
			if (!fromItem) {
				continue
			}

			if (fromItem.reason & (TrackingReasonMask.Included | TrackingReasonMask.Opened)) {
				return true
			}

			if (this.isImportedAncestrally(fromURI, depth - 1)) {
				return true
			}
		}

		return false
	}

	delete(uri: string) {
		this.trackingMap.delete(uri)

		let importURIs = this.importMap.getByLeft(uri)
		this.importMap.deleteLeft(uri)
		this.importMap.deleteRight(uri)

		if (importURIs) {
			for (let importURI of importURIs) {
				this.checkImportedRecursively(importURI)
			}
		}
	}

	clear() {
		this.trackingMap.clear()
		this.importMap.clear()
		this.allFresh = false
	}

	/** 
	 * Track or re-track by reason.
	 * Can call it after file content changed.
	 */
	trackByReason(uri: string, reason: TrackingReasonMask | 0) {
		let item = this.trackingMap.get(uri)

		if (item) {
			item.reason |= reason

			// Validate opened document version.
			if (item.opened && item.document) {
				if (item.version !== item.document.version) {
					this.makeExpire(uri)
				}
			}

			// When can't compare document, treat as fresh.
		}
		else {
			item = {
				document: null,
				version: 0,
				reason,
				latestUseTime: 0,
				opened: false,
				fresh: false,
			}

			this.trackingMap.set(uri, item)
			this.allFresh = false
		}

		this.checkImportedRecursively(uri)
	}

	/** Track opened document. */
	trackByDocument(document: TextDocument) {
		let uri = document.uri
		let item = this.trackingMap.get(uri)

		if (item) {
			let fileChanged = document.version !== item.version
			item.document = document
			item.version = document.version
			item.reason |= TrackingReasonMask.Opened
			item.opened = true

			if (fileChanged) {
				this.makeExpire(uri)
			}

			this.checkImportedRecursively(uri)
		}
		else {
			item = {
				document,
				version: document.version,
				reason: TrackingReasonMask.Opened,
				latestUseTime: 0,
				opened: true,
				fresh: false,
			}

			this.trackingMap.set(uri, item)
			this.allFresh = false
		}
	}

	/** Remove reason, if file has no reason, delete it. */
	removeReason(uri: string, reason: TrackingReasonMask) {
		let item = this.trackingMap.get(uri)
		if (!item) {
			return
		}

		item.reason &= ~reason

		if (reason & TrackingReasonMask.Opened && item.document) {
			item.document = null
		}

		this.checkImportedRecursively(uri)
	}

	/** After knows that file get expired. */
	private makeExpire(uri: string) {
		let item = this.trackingMap.get(uri)
		if (!item) {
			return
		}

		let fresh = item.fresh
		if (!fresh) {
			return
		}
		
		item.fresh = false
		item.version = 0
		this.allFresh = false

		// Will replace import mapping after reload, here no need to clear import mapping.
		// this.importMap.deleteLeft(uri)
	}
}