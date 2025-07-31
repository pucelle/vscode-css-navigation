/** 
 * `K => V[]` Map Struct.
 * Good for purely adding.
 */
export class ListMap<K, V> {

	protected map: Map<K, V[]> = new Map()

	/** Iterate all keys. */
	keys(): Iterable<K> {
		return this.map.keys()
	}

	/** Iterate all values in list type. */
	valueLists(): Iterable<V[]> {
		return this.map.values()
	}

	/** Iterate all values. */
	*values(): Iterable<V> {
		for (let list of this.map.values()) {
			yield* list
		}
	}

	/** Iterate each key and associated value list. */
	entries(): Iterable<[K, V[]]> {
		return this.map.entries()
	}

	/** Iterate each key and each associated value after flatted. */
	*flatEntries(): Iterable<[K, V]> {
		for (let [key, values] of this.map.entries()) {
			for (let value of values) {
				yield [key, value]
			}
		}
	}

	/** Has specified key and value pair existed. */
	has(k: K, v: V): boolean {
		return !!this.map.get(k)?.includes(v)
	}

	/** Has specified key existed. */
	hasKey(k: K): boolean {
		return this.map.has(k)
	}

	/** Get the count of values by associated key. */
	countOf(k: K) {
		return this.map.get(k)?.length || 0
	}

	/** Get the count of all the values. */
	valueCount(): number {
		let count = 0

		for (let values of this.map.values()) {
			count += values.length
		}

		return count
	}

	/** Get the count of all the keys. */
	keyCount(): number {
		return this.map.size
	}

	/** 
	 * Add a key and a value.
	 * Note it will not validate whether value exist,
	 * and will add value repeatedly although it exists.
	 */
	add(k: K, v: V) {
		let values = this.map.get(k)
		if (!values) {
			values = [v]
			this.map.set(k, values)
		}
		else {
			values.push(v)
		}
	}

	/** 
	 * Add a key and several values.
	 * Note it will not validate whether value exist,
	 * and will add value repeatedly although it exists.
	 */
	addSeveral(k: K, vs: V[]) {
		if (vs.length === 0) {
			return
		}

		let values = this.map.get(k)
		if (!values) {
			values = [...vs]
			this.map.set(k, values)
		}
		else {
			values.push(...vs)
		}
	}

	/** 
	 * Add a key and a value.
	 * Note it will validate whether value exist, and ignore if value exists.
	 */
	addIf(k: K, v: V) {
		let values = this.map.get(k)
		if (!values) {
			values = [v]
			this.map.set(k, values)
		}
		else if (!values.includes(v)) {
			values.push(v)
		}
	}

	/** 
	 * Add a key and a value.
	 * Note it will validate whether value exist, and ignore if value exists.
	 */
	addSeveralIf(k: K, vs: V[]) {
		if (vs.length === 0) {
			return
		}

		let values = this.map.get(k)
		if (!values) {
			values = []
			this.map.set(k, values)
		}

		for (let v of vs) {
			if (!values.includes(v)) {
				values.push(v)
			}
		}
	}

	/** Get value list by associated key. */
	get(k: K): V[] | undefined {
		return this.map.get(k)
	}

	/** Set and replace whole value list by associated key. */
	set(k: K, list: V[]) {
		return this.map.set(k, list)
	}

	/** Delete a key value pair. */
	delete(k: K, v: V) {
		let values = this.map.get(k)
		if (values) {
			let index = values.indexOf(v)
			if (index > -1) {
				values.splice(index, 1)
				
				if (values.length === 0) {
					this.map.delete(k)
				}
			}
		}
	}

	/** Delete a key and several values. */
	deleteSeveral(k: K, vs: Iterable<V>): void {
		let values = this.map.get(k)
		if (values) {
			for (let v of vs) {
				let index = values.indexOf(v)
				if (index > -1) {
					values.splice(index, 1)
				}
			}
								
			if (values.length === 0) {
				this.map.delete(k)
			}
		}
	}

	/** Delete all values by associated key. */
	deleteOf(k: K) {
		this.map.delete(k)
	}

	/** Clear all the data. */
	clear() {
		this.map = new Map()
	}
}


/** 
 * `K => Set<V>` Map Struct.
 * Good for dynamically adding & deleting.
 */
export class SetMap<K, V> {

	protected map: Map<K, Set<V>> = new Map()

	/** Iterate all keys. */
	keys(): Iterable<K> {
		return this.map.keys()
	}

	/** Iterate all values in list type. */
	valueLists(): Iterable<Set<V>> {
		return this.map.values()
	}

	/** Iterate all values. */
	*values(): Iterable<V> {
		for (let list of this.map.values()) {
			yield* list
		}
	}

	/** Iterate each key and associated value list. */
	entries(): Iterable<[K, Set<V>]> {
		return this.map.entries()
	}

	/** Iterate each key and each associated value after flatted. */
	*flatEntries(): Iterable<[K, V]> {
		for (let [key, values] of this.map.entries()) {
			for (let value of values) {
				yield [key, value]
			}
		}
	}

	/** Has specified key and value pair existed. */
	has(k: K, v: V): boolean {
		return !!this.map.get(k)?.has(v)
	}

	/** Has specified key existed. */
	hasKey(k: K): boolean {
		return this.map.has(k)
	}

	/** Get the count of values by associated key. */
	countOf(k: K) {
		return this.map.get(k)?.size || 0
	}

	/** Get the count of all the values. */
	valueCount(): number {
		let count = 0

		for (let values of this.map.values()) {
			count += values.size
		}

		return count
	}

	/** Get the count of all the keys. */
	keyCount(): number {
		return this.map.size
	}

	/** Get value list by associated key. */
	get(k: K): Set<V> | undefined {
		return this.map.get(k)
	}

	/** Clone to get a new list map with same data. */
	clone(): SetMap<K, V> {
		let cloned = new SetMap<K, V>()

		for (let [key, set] of this.map.entries()) {
			cloned.map.set(key, new Set(set))
		}

		return cloned
	}

	/** Add a key value pair. */
	add(k: K, v: V) {
		let values = this.map.get(k)
		if (!values) {
			values = new Set()
			this.map.set(k, values)
		}

		values.add(v)
	}

	/** Add a key and several values. */
	addSeveral(k: K, vs: V[]) {
		if (vs.length === 0) {
			return
		}

		let values = this.map.get(k)
		if (!values) {
			values = new Set(vs)
			this.map.set(k, values)
		}
		else {
			for (let v of vs) {
				values.add(v)
			}
		}
	}

	/** Set and replace whole value list by associated key. */
	set(k: K, list: Set<V>) {
		return this.map.set(k, list)
	}

	/** Delete a key value pair. */
	delete(k: K, v: V) {
		let values = this.map.get(k)
		if (values) {
			values.delete(v)

			if (values.size === 0) {
				this.map.delete(k)
			}
		}
	}

	/** Delete a key and several values. */
	deleteSeveral(k: K, vs: Iterable<V>): void {
		let values = this.map.get(k)
		if (values) {
			for (let v of vs) {
				values.delete(v)
			}
								
			if (values.size === 0) {
				this.map.delete(k)
			}
		}
	}

	/** Delete all values by associated key. */
	deleteOf(k: K) {
		this.map.delete(k)
	}

	/** Clear all the data. */
	clear() {
		this.map = new Map()
	}
}


/**
 * Map Struct that can query from left to right list and right to left list.
 * `L -> R[]`
 * `R -> L[]`
 */
export class TwoWayListMap<L, R> {

	protected lm: ListMap<L, R> = new ListMap()
	protected rm: ListMap<R, L> = new ListMap()

	/** Returns total count of left keys. */
	leftKeyCount(): number {
		return this.lm.keyCount()
	}

	/** Returns total count of right keys. */
	rightKeyCount(): number {
		return this.rm.keyCount()
	}

	/** Iterate all left keys. */
	leftKeys(): Iterable<L> {
		return this.lm.keys()
	}

	/** Iterate all right keys. */
	rightKeys(): Iterable<R> {
		return this.rm.keys()
	}

	/** Iterate associated right keys by left key. */
	*rightValuesOf(l: L): Iterable<R> {
		let rs = this.lm.get(l)
		if (rs) {
			yield* rs
		} 
	}

	/** Iterate associated left keys by right key. */
	*leftValuesOf(r: R): Iterable<L> {
		let ls = this.rm.get(r)
		if (ls) {
			yield* ls
		}
	}

	/** Iterate left and it's associated right value list. */
	leftEntries(): Iterable<[L, R[]]> {
		return this.lm.entries()
	}

	/** Iterate right and it's associated left value list. */
	rightEntries(): Iterable<[R, L[]]> {
		return this.rm.entries()
	}
	
	/** Iterate each left and right key pairs. */
	flatEntries(): Iterable<[L, R]> {
		return this.lm.flatEntries()
	}

	/** Has a left and right key pair. */
	has(l: L, r: R): boolean {
		return this.lm.has(l, r)
	}

	/** Has a left key. */
	hasLeft(l: L): boolean {
		return this.lm.hasKey(l)
	}

	/** Has a right key. */
	hasRight(r: R): boolean {
		return this.rm.hasKey(r)
	}

	/** Get count of associated right keys by a left key. */
	countOfLeft(l: L): number {
		return this.lm.countOf(l)
	}

	/** Get count of associated left keys by a right key. */
	countOfRight(r: R): number {
		return this.rm.countOf(r)
	}

	/** Get associated right keys by a left key. */
	getByLeft(l: L): R[] | undefined {
		return this.lm.get(l)
	}

	/** Get associated left keys by a right key. */
	getByRight(r: R): L[] | undefined {
		return this.rm.get(r)
	}

	/** 
	 * Add a left and right value as a pair.
	 * Note it will not validate whether value exist, and will add it repeatedly if it exists.
	 */
	add(l: L, r: R) {
		this.lm.add(l, r)
		this.rm.add(r, l)
	}

	/** 
	 * Add a left and right value as a pair.
	 * Note it will validate whether value exist, and do nothing if it exists.
	 */
	addIf(l: L, r: R) {
		this.lm.addIf(l, r)
		this.rm.addIf(r, l)
	}

	/** Delete a left and right key pair. */
	delete(l: L, r: R) {
		this.lm.delete(l, r)
		this.rm.delete(r, l)
	}

	/** Delete by left key. */
	deleteLeft(l: L) {
		let rs = this.getByLeft(l)
		if (rs) {
			for (let r of rs) {
				this.rm.delete(r, l)
			}

			this.lm.deleteOf(l)
		}
	}

	/** Delete by right key. */
	deleteRight(r: R) {
		let ls = this.getByRight(r)
		if (ls) {
			for (let l of ls) {
				this.lm.delete(l, r)
			}

			this.rm.deleteOf(r)
		}
	}

	/** Replace left and all it's associated right keys. */
	replaceLeft(l: L, rs: R[]) {
		let oldRs = this.lm.get(l)

		if (oldRs) {
			for (let r of rs) {
				if (!oldRs.includes(r)) {
					this.rm.add(r, l)
				}
			}

			for (let r of oldRs) {
				if (!rs.includes(r)) {
					this.rm.delete(r, l)
				}
			}
		}
		else {
			for (let r of rs) {
				this.rm.add(r, l)
			}
		}

		if (rs.length === 0) {
			if (oldRs) {
				this.lm.deleteOf(l)
			}
		}
		else {
			this.lm.set(l, rs)
		}
	}

	/** Replace right and all it's associated left keys. */
	replaceRight(r: R, ls: L[]) {
		let oldLs = this.rm.get(r)

		if (oldLs) {
			for (let l of ls) {
				if (!oldLs.includes(l)) {
					this.lm.add(l, r)
				}
			}

			for (let l of oldLs) {
				if (!ls.includes(l)) {
					this.lm.delete(l, r)
				}
			}
		}
		else {
			for (let l of ls) {
				this.lm.add(l, r)
			}
		}

		if (ls.length === 0) {
			if (oldLs) {
				this.rm.deleteOf(r)
			}
		}
		else {
			this.rm.set(r, ls)
		}
	}

	/** Clear all the data. */
	clear() {
		this.lm.clear()
		this.rm.clear()
	}
}
