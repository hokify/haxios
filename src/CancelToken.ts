/**
 * A `CancelToken` is an object that can be used to request cancellation of an operation.
 *
 * @class
 * @param {Function} executor The executor function.
 */

export class Cancel {
	constructor(public readonly message?: string) {}

	toString() {
		return 'Cancel' + (this.message ? ': ' + this.message : '');
	}
}

export type Canceler = (message?: string) => void;

export interface CancelTokenSource {
	token: CancelToken;
	cancel: Canceler;
}

export class CancelToken {
	promise: Promise<any>;
	_listeners?: any[];
	reason?: Cancel;

	static isCancel(obj: any): obj is Cancel {
		return obj instanceof Cancel;
	}

	constructor(executor: (callback: Canceler) => void) {
		if (typeof executor !== 'function') {
			throw new TypeError('executor must be a function.');
		}

		var resolvePromise: any;

		this.promise = new Promise(function promiseExecutor(resolve) {
			resolvePromise = resolve;
		});

		var token = this;

		// eslint-disable-next-line func-names
		this.promise.then(function (cancel) {
			if (!token._listeners) return;

			var i;
			var l = token._listeners.length;

			for (i = 0; i < l; i++) {
				token._listeners[i](cancel);
			}
			token._listeners = undefined;
		});

		// eslint-disable-next-line func-names
		this.promise.then = function (onfulfilled) {
			var _resolve: any;
			// eslint-disable-next-line func-names
			var promise: any = new Promise(function (resolve) {
				token.subscribe(resolve);
				_resolve = resolve;
			}).then(onfulfilled);

			promise.cancel = function reject() {
				token.unsubscribe(_resolve);
			};

			return promise;
		};

		executor(function cancel(message) {
			if (token.reason) {
				// Cancellation has already been requested
				return;
			}

			token.reason = new Cancel(message);
			resolvePromise(token.reason);
		});
	}

	/**
	 * Throws a `Cancel` if cancellation has been requested.
	 */
	throwIfRequested() {
		if (this.reason) {
			throw this.reason;
		}
	}

	/**
	 * Subscribe to the cancel signal
	 */
	subscribe(listener: (reason: Cancel) => void) {
		if (this.reason) {
			listener(this.reason);
			return;
		}

		if (this._listeners) {
			this._listeners.push(listener);
		} else {
			this._listeners = [listener];
		}
	}

	/**
	 * Unsubscribe from the cancel signal
	 */
	unsubscribe(listener: (reason: Cancel) => void) {
		if (!this._listeners) {
			return;
		}
		var index = this._listeners.indexOf(listener);
		if (index !== -1) {
			this._listeners.splice(index, 1);
		}
	}

	/**
	 * Returns an object that contains a new `CancelToken` and a function that, when called,
	 * cancels the `CancelToken`.
	 */
	static source(): CancelTokenSource {
		let cancel: Canceler;
		const token = new CancelToken(function executor(c) {
			cancel = c;
		});
		return {
			token: token,
			cancel: cancel!
		};
	}
}
