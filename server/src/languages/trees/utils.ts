import {AnyToken} from '../scanners'


/** `"ab"` => `ab`. */
export function removeQuotes(text: string): string {
	if (/^['"]/.test(text)) {
		text = text.slice(1)
	}

	if (/['"]$/.test(text)) {
		text = text.slice(-1)
	}

	return text
}


/** Returns whether has been quoted. */
export function hasQuotes(text: string): boolean {
	return /^['"]/.test(text) && /['"]$/.test(text)
}


/** Returns whether has expression. */
export function mayBeExpression(text: string): boolean {
	return !hasQuotes(text) && text.includes('{')
}


/** Join several tokens to one. */
export function joinTokens<T extends AnyToken<any>>(tokens: T[], string: string): T {
	if (tokens.length === 1) {
		return tokens[0]
	}
	else {
		let type = tokens[0].type
		let start = tokens[0].start
		let end = tokens[tokens.length - 1].end
		let text = string.slice(start, end)

		return {
			type,
			text,
			start,
			end,
		} as T
	}
}


/** Escape as regexp source text.`\.` -> `\\.` */
export function escapeAsRegExpSource(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}


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