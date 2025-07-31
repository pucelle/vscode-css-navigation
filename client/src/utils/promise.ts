/** Returns a promise, with it's resolve and reject. */
export function promiseWithResolves<T = void>(): {
	promise: Promise<T>,
	resolve: (value: T | PromiseLike<T>) => void,
	reject: (err?: any) => void
} {
	let resolve: (value: T | PromiseLike<T>) => void
	let reject: (err: any) => void

	let promise = new Promise((res, rej) => {
		resolve = res as (value: T | PromiseLike<T>) => void
		reject = rej
	}) as Promise<T>

	return {
		promise,
		resolve: resolve!,
		reject: reject!,
	}
}
