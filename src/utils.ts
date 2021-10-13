/**
 * Determine if a value is undefined
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if the value is undefined, otherwise false
 * @deprecated
 */
export function isUndefined(val) {
	return typeof val === 'undefined';
}

/**
 * Determine if a value is a Buffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Buffer, otherwise false
 * @deprecated
 */
export function isBuffer(val) {
	return (
		val !== null &&
		!isUndefined(val) &&
		val.constructor !== null &&
		!isUndefined(val.constructor) &&
		typeof val.constructor.isBuffer === 'function' &&
		val.constructor.isBuffer(val)
	);
}

/**
 * Determine if a value is an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an ArrayBuffer, otherwise false
 * @deprecated
 */
export function isArrayBuffer(val) {
	return toString.call(val) === '[object ArrayBuffer]';
}

/**
 * Determine if a value is a FormData
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an FormData, otherwise false
 */
export function isFormData(obj) {
	return typeof FormData !== 'undefined' && obj instanceof FormData;
}

export function isPlainObject(obj) {
	const prototype = Object.getPrototypeOf(obj);
	return (
		prototype === null ||
		prototype.constructor === Object ||
		prototype.constructor === null ||
		Object.prototype.toString.call(prototype) === '[object Object]'
	);
}

/**
 * Determine if a value is a view on an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
 */
export function isArrayBufferView(val) {
	var result;
	if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView) {
		result = ArrayBuffer.isView(val);
	} else {
		result = val && val.buffer && val.buffer instanceof ArrayBuffer;
	}
	return result;
}

/**
 * Determine if a value is an Object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Object, otherwise false
 * @deprecated
 */
export function isObject(val) {
	return val !== null && typeof val === 'object';
}

/**
 * Determine if a value is a Function
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Function, otherwise false
 * @deprecated
 */
export function isFunction(val) {
	return toString.call(val) === '[object Function]';
}

/**
 * Determine if a value is a Stream
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Stream, otherwise false
 * @deprecated
 */
export function isStream(val) {
	return isObject(val) && isFunction(val.pipe);
}

/**
 * Determine if a value is a URLSearchParams object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a URLSearchParams object, otherwise false
 */
export function isURLSearchParams(val) {
	return typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams;
}

/**
 * Determine if a value is a File
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a File, otherwise false
 * @deprecated
 */
export function isFile(val) {
	return toString.call(val) === '[object File]';
}

/**
 * Determine if a value is a Blob
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Blob, otherwise false
 * @deprecated
 */
export function isBlob(val) {
	return toString.call(val) === '[object Blob]';
}
