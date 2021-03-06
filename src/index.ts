import * as Gaxios from 'gaxios';
import { InterceptorHandler, InterceptorManager } from './InterceptorManager';
import {
	AxiosAdapter,
	AxiosConfig,
	DefaultRequestConfig,
	HAxiosRequestConfig,
	HAxiosRequestConfigBase,
	HAxiosResponse
} from './axios';
import { Headers, GaxiosError, GaxiosOptions } from 'gaxios';
import { GaxiosResponse } from 'gaxios/build/src/common';
import { Cancel, CancelToken } from './CancelToken';
import {
	isFormData,
	isPlainObject,
	isURLSearchParams,
	isArrayBufferView,
	parseHeaders
} from './utils';

export type { Cancel, Canceler, CancelToken, CancelTokenSource } from './CancelToken';

export * from './axios';

export { GaxiosError as AxiosError };
export type { HAxiosResponse as AxiosResponse };
export type { HAxiosRequestConfigBase as AxiosRequestConfig };
export type { HAxiosRequestConfig };
export type { DefaultRequestConfig };

export type Method = GaxiosOptions['method'];

type HaxiosOptions = GaxiosOptions & {
	headers: Headers;
	adapter?: AxiosAdapter;
	compress?: boolean;
};

const creatAxiosError = (
	message: string,
	options: AxiosConfig,
	code: string,
	response?: GaxiosResponse<any>
) => {
	const err = new GaxiosError(message, options as any, response || ({ status: code } as any));
	err.code = code;
	return err;
};

function getConfig(err: GaxiosError) {
	if (err && err.config && err.config.retryConfig) {
		return err.config.retryConfig;
	}
	return;
}

async function shouldRetryRequest(err: GaxiosError) {
	const config = err.config?.retryConfig;

	// node-fetch raises an AbortError if signaled:
	// https://github.com/bitinn/node-fetch#request-cancellation-with-abortsignal
	if (err.name === 'AbortError') {
		return false;
	}

	// If there's no config, or retries are disabled, return.
	if (!config || config.retry === 0) {
		return false;
	}

	// Check if this error has no response (ETIMEDOUT, ENOTFOUND, etc)
	if (!err.response && (config.currentRetryAttempt || 0) >= config.noResponseRetries!) {
		return false;
	}

	// Only retry with configured HttpMethods.
	if (
		!err.config.method ||
		config.httpMethodsToRetry!.indexOf(err.config.method.toUpperCase()) < 0
	) {
		return false;
	}

	// If this wasn't in the list of status codes where we want
	// to automatically retry, return.
	if (err.response?.status) {
		let isInRange = false;
		for (const [min, max] of config.statusCodesToRetry!) {
			const status = err.response.status;
			if (status >= min && status <= max) {
				isInRange = true;
				break;
			}
		}
		if (!isInRange) {
			return false;
		}
	}

	// If we are out of retry attempts, return
	config.currentRetryAttempt = config.currentRetryAttempt || 0;
	if (
		config.currentRetryAttempt >=
		(err.response?.status === 429 ? Math.max(config.retry!, 5) : config.retry!)
	) {
		return false;
	}

	// RETRY DELAY - unfortunately gaxios doesn't wait on "onRetryAttempt",
	// therefore we need to put that in here
	let finalDelay: number | undefined;

	const retryAfterHeader =
		err.response?.headers['Retry-After'] || err.response?.headers['retry-after'];
	if (retryAfterHeader) {
		// we got an retry-after header
		let nval = Number(retryAfterHeader);
		if (Number.isFinite(nval)) {
			// it's given in seconds, we need ms (*1000)
			finalDelay = (nval || 1) * 1000;
		} else {
			let retryDateMS = Date.parse(retryAfterHeader);
			if (!Number.isNaN(retryDateMS)) {
				finalDelay = retryDateMS - Date.now();
			}
		}
	}

	if (!finalDelay) {
		// do exponential back off
		const delay = Math.pow(2, config.currentRetryAttempt || 0) * 1000;
		const randomSum = delay * 0.2 * Math.random(); // 0-20% of the delay
		finalDelay = delay + randomSum;
	}

	await new Promise(resolve => setTimeout(resolve, finalDelay));

	return true;
}

export class AxiosWrapper {
	private gaxiosInstance: Gaxios.Gaxios;

	baseURL?: string;

	private transformAxiosConfigToGaxios(config: AxiosConfig, initialize = false): GaxiosOptions {
		if (!initialize) {
			// apply defaults
			config = {
				...this.defaults,
				...config,
				// ensure deep copy of defaults of headers
				headers: {
					...this.defaults.headers,
					...config.headers
				}
			};
		}

		// default retry config
		config.retry = config.retry ?? true;
		if (config.retry) {
			// overwrite default retry config
			config.retryConfig = {
				shouldRetry: shouldRetryRequest,
				...(config.retryConfig || {})
			};
		}

		const isBrowser = typeof window !== 'undefined';
		if (config.timeout) {
			const timeout = parseInt(config.timeout as any, 10);

			if (isNaN(timeout)) {
				throw creatAxiosError(
					'error trying to parse `config.timeout` to int',
					config,
					'ERR_PARSE_TIMEOUT'
				);
			}

			config.timeout = timeout;
		}
		if (!config.headers) config.headers = {};
		var headerNames = {};
		Object.keys(config.headers).forEach(name => {
			headerNames[name.toLowerCase()] = name;
		});

		// HTTP basic authentication
		if (config.auth) {
			var username = config.auth.username || '';
			var password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';

			// todo: get rid of btoa
			config.headers[headerNames['authorization'] || 'Authorization'] =
				'Basic ' + btoa(username + ':' + password);
		}

		if (config.withCredentials) {
			config.credentials = 'include';
		}

		const setContentTypeIfUnset = (contentType: string) => {
			if ('content-type' in headerNames) {
				// is set already
				return;
			}
			if (!config.headers) config.headers = {};
			config.headers['Content-Type'] = contentType;
		};

		let originalData: any | undefined;
		if (
			// if we have a content-type already, we do no magic transformation
			!headerNames['content-type'] &&
			typeof config.data === 'object' &&
			isPlainObject(config.data)
		) {
			setContentTypeIfUnset('application/json');
			config.data = JSON.stringify(config.data);
		} else if (config.data) {
			if (isURLSearchParams(config.data)) {
				setContentTypeIfUnset('application/x-www-form-urlencoded;charset=utf-8');
			}
			/** special handling via config.adapter!
			 * see https://github.com/googleapis/gaxios/issues/447 */
			originalData = config.data;
			// config.data = undefined;
		}

		if (!config.adapter && !initialize) {
			config.adapter = (async (options: AxiosConfig, defaultAdapter) => {
				try {
					// reapply original data
					// due to a bug/missing functionality in gaxios, data is parsed as json
					// see https://github.com/googleapis/gaxios/issues/447
					if (originalData) {
						options.body = originalData;
						if (isFormData(originalData)) {
							delete options.headers?.['Content-Type']; // Let the browser set it
						}
					}

					let adapter = defaultAdapter;

					// upload progress is currently not supproted by fetch
					// switch to XHR on client in this case (on server we do not care about upload progerss right now)
					// https://stackoverflow.com/questions/35711724/upload-progress-indicators-for-fetch
					if (isBrowser && typeof config.onUploadProgress === 'function') {
						const xhr = new XMLHttpRequest();
						adapter = (adapterConfig: AxiosConfig) =>
							new Promise((resolve, reject) => {
								if (xhr.upload) {
									xhr.upload.addEventListener('progress', event => {
										if (event.lengthComputable) {
											adapterConfig.onUploadProgress!(event); // .value = event.loaded / event.total;
										}
									});
								}

								xhr.addEventListener('onabort', reject);
								xhr.addEventListener('onerror', reject);

								if (
									adapterConfig.responseType &&
									adapterConfig.responseType !== 'json' &&
									adapterConfig.responseType !== 'stream'
								) {
									xhr.responseType = adapterConfig.responseType;
								}

								if (adapterConfig.timeout !== undefined) {
									xhr.timeout = adapterConfig.timeout;
								}

								xhr.addEventListener('loadend', () => {
									// Prepare the response
									const responseHeaders =
										'getAllResponseHeaders' in xhr ? parseHeaders(xhr.getAllResponseHeaders()) : {};
									let responseData =
										!adapterConfig.responseType ||
										adapterConfig.responseType === 'text' ||
										adapterConfig.responseType === 'json'
											? xhr.responseText
											: xhr.response;

									switch (adapterConfig.responseType) {
										case 'json': {
											try {
												responseData = JSON.parse(responseData);
											} catch (_a) {
												// continue
											}
											break;
										}
										case 'stream':
										case 'arraybuffer':
										case 'blob':
										default:
											// keep it as it is
											break;
									}

									if (xhr.readyState === 4 && xhr.status === 200) {
										resolve({
											data: responseData,
											status: xhr.status,
											statusText: xhr.statusText,
											headers: responseHeaders,
											config: config,
											request: xhr
										});
									} else {
										reject(
											new GaxiosError(`Request failed with status code ${xhr.status}`, config, {
												data: responseData,
												status: xhr.status,
												statusText: xhr.statusText,
												headers: responseHeaders,
												request: xhr,
												config
											})
										);
									}
								});

								xhr.open(adapterConfig.method!, adapterConfig.url!, true);
								for (const header in adapterConfig.headers) {
									xhr.setRequestHeader(header, adapterConfig.headers[header]);
								}
								xhr.withCredentials = adapterConfig.credentials === 'include';
								xhr.send(adapterConfig.body);
							});
					}

					const result = (await adapter(options)) as HAxiosResponse;

					try {
						if (result.request?.responseURL) {
							const myURL = new URL(result.request.responseURL);

							result.request = {
								...myURL,
								// backward compatiblity
								path: myURL.pathname?.toString() || '',
								responseURL: result.request.responseURL
							};
						}
					} catch (err) {
						console.info('parsing failed', err);
					}

					return result;
				} catch (err: any) {
					throw err;
				}
			}) as HaxiosOptions['adapter'];
		}

		if (config.decompress !== undefined && (config as HaxiosOptions).compress === undefined) {
			(config as HaxiosOptions).compress = config.decompress;
		}

		return config;
	}

	constructor(config: AxiosConfig = { headers: {} }) {
		const gaxiosConfig = this.transformAxiosConfigToGaxios(config, true);
		this.gaxiosInstance = new Gaxios.Gaxios({
			// ensure headers object is intiialized
			headers: {},
			...gaxiosConfig,
			// set baseURL on request time
			baseURL: ''
		});

		this.baseURL = gaxiosConfig.baseURL;
	}

	get defaults(): HaxiosOptions {
		return this.gaxiosInstance.defaults as HaxiosOptions;
	}

	interceptors = {
		request: new InterceptorManager(),
		response: new InterceptorManager()
	};

	async request<
		RETURN = any,
		INPUT = any,
		CONFIG extends HAxiosRequestConfig<INPUT> = HAxiosRequestConfig<INPUT>
	>(requestParams: CONFIG): Promise<HAxiosResponse<RETURN, INPUT, CONFIG>> {
		try {
			if (!requestParams.url?.startsWith('http://') && !requestParams.url?.startsWith('https://')) {
				// set default baseURL is on baseURL is provided
				if (!requestParams.baseURL) {
					requestParams.baseURL = this.baseURL;
				}
				// sanitize baseURL
				if (!requestParams.baseURL?.endsWith('/') && !requestParams.url?.startsWith('/')) {
					requestParams.baseURL += '/';
				}
			}

			const gaxiosRequestParams = this.transformAxiosConfigToGaxios(requestParams);

			// filter out skipped interceptors
			const requestInterceptorChain: any[] = [];
			let synchronousRequestInterceptors = true;
			this.interceptors.request.forEach(function unshiftRequestInterceptors(
				interceptor: InterceptorHandler
			) {
				if (
					typeof interceptor.runWhen === 'function' &&
					interceptor.runWhen(gaxiosRequestParams) === false
				) {
					return;
				}

				synchronousRequestInterceptors = !!(
					synchronousRequestInterceptors && interceptor.synchronous
				);

				requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
			});

			const responseInterceptorChain: any[] = [];
			this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
				responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
			});

			let promise: Promise<any>;

			if (!synchronousRequestInterceptors) {
				let chain = [this.gaxiosInstance.request.bind(this.gaxiosInstance), undefined];

				Array.prototype.unshift.apply(chain, requestInterceptorChain);
				chain = chain.concat(responseInterceptorChain);

				promise = Promise.resolve(gaxiosRequestParams);

				while (chain.length) {
					promise = promise.then(chain.shift(), chain.shift());
				}

				return await promise;
			}

			let newConfig = gaxiosRequestParams;
			while (requestInterceptorChain.length) {
				const onFulfilled = requestInterceptorChain.shift();
				const onRejected = requestInterceptorChain.shift();
				try {
					newConfig = onFulfilled(newConfig);
				} catch (error) {
					onRejected(error);
					break;
				}
			}

			try {
				promise = this.gaxiosInstance.request(newConfig);
			} catch (error) {
				return Promise.reject(error);
			}

			while (responseInterceptorChain.length) {
				promise = promise.then(responseInterceptorChain.shift(), responseInterceptorChain.shift());
			}

			return await promise;
		} catch (err: any) {
			// mirror behaviour of XHR
			if (err.type === 'request-timeout') {
				err.code = 'ECONNABORTED';
			}
			throw err;
		}
	}

	get<
		RETURN = any,
		INPUT = any,
		CONFIG extends HAxiosRequestConfig<INPUT> = DefaultRequestConfig<INPUT>
	>(url: string, config?: CONFIG): Promise<HAxiosResponse<RETURN, INPUT, CONFIG>> {
		return this.request({ url, method: 'GET', ...config }) as Promise<
			HAxiosResponse<RETURN, INPUT, CONFIG>
		>;
	}

	getUri<RETURN = any, CONFIG extends HAxiosRequestConfig<never> = HAxiosRequestConfig<never>>(
		config: CONFIG
	): Promise<HAxiosResponse<RETURN, never, CONFIG>> {
		return this.request(config);
	}

	delete<
		RETURN = any,
		INPUT = any,
		CONFIG extends HAxiosRequestConfig<INPUT> = DefaultRequestConfig<INPUT>
	>(url: string, config?: CONFIG): Promise<HAxiosResponse<RETURN, INPUT, CONFIG>> {
		return this.request({ url, method: 'DELETE', ...config }) as Promise<
			HAxiosResponse<RETURN, INPUT, CONFIG>
		>;
	}

	head<
		RETURN = any,
		INPUT = any,
		CONFIG extends HAxiosRequestConfig<INPUT> = DefaultRequestConfig<INPUT>
	>(url: string, config?: CONFIG): Promise<HAxiosResponse<RETURN, INPUT, CONFIG>> {
		return this.request({ url, method: 'HEAD', ...config }) as Promise<
			HAxiosResponse<RETURN, INPUT, CONFIG>
		>;
	}

	options<
		RETURN = any,
		INPUT = any,
		CONFIG extends HAxiosRequestConfig<INPUT> = DefaultRequestConfig<INPUT>
	>(url: string, config?: CONFIG): Promise<HAxiosResponse<RETURN, INPUT, CONFIG>> {
		return this.request({ url, method: 'OPTIONS', ...config }) as Promise<
			HAxiosResponse<RETURN, INPUT, CONFIG>
		>;
	}

	post<
		RETURN = any,
		INPUT = any,
		CONFIG extends HAxiosRequestConfig<INPUT> = DefaultRequestConfig<INPUT>
	>(url: string, data?: INPUT, config?: CONFIG): Promise<HAxiosResponse<RETURN, INPUT, CONFIG>> {
		return this.request({ url, method: 'POST', data, ...config }) as Promise<
			HAxiosResponse<RETURN, INPUT, CONFIG>
		>;
	}

	put<
		RETURN = any,
		INPUT = any,
		CONFIG extends HAxiosRequestConfig<INPUT> = DefaultRequestConfig<INPUT>
	>(url: string, data?: INPUT, config?: CONFIG): Promise<HAxiosResponse<RETURN, INPUT, CONFIG>> {
		return this.request({ url, method: 'PUT', data, ...config }) as Promise<
			HAxiosResponse<RETURN, INPUT, CONFIG>
		>;
	}

	patch<
		RETURN = any,
		INPUT = any,
		CONFIG extends HAxiosRequestConfig<INPUT> = DefaultRequestConfig<INPUT>
	>(url: string, data?: INPUT, config?: CONFIG): Promise<HAxiosResponse<RETURN, INPUT, CONFIG>> {
		return this.request({ url, method: 'PATCH', data, ...config }) as Promise<
			HAxiosResponse<RETURN, INPUT, CONFIG>
		>;
	}

	setBaseURL(baseURL: string) {
		this.baseURL = baseURL;
	}

	setHeader(name: string, value: string) {
		if (!value) {
			delete this.defaults.headers?.[name];
			return;
		}
		if (!this.defaults.headers) {
			this.defaults.headers = {};
		}
		this.defaults.headers[name] = value;
	}

	create(config?: AxiosConfig): AxiosInstance {
		return AxiosWrapper.create(config);
	}

	isAxiosError(err: any): err is GaxiosError {
		return err instanceof GaxiosError;
	}

	CancelToken = CancelToken;

	isCancel(err: any): err is Cancel {
		return CancelToken.isCancel(err);
	}

	Cancel = Cancel;

	static create(config?: AxiosConfig): AxiosInstance {
		const instance = new AxiosWrapper(config);

		const enrichedInstance: AxiosInstance = instance.request.bind(instance) as AxiosInstance;

		enrichedInstance.interceptors = instance.interceptors;
		enrichedInstance.defaults = instance.defaults;
		enrichedInstance.baseURL = instance.baseURL;

		enrichedInstance.request = instance.request.bind(instance);
		enrichedInstance.getUri = instance.getUri.bind(instance);
		enrichedInstance.get = instance.get.bind(instance);
		enrichedInstance.delete = instance.delete.bind(instance);
		enrichedInstance.head = instance.head.bind(instance);
		enrichedInstance.options = instance.options.bind(instance);
		enrichedInstance.post = instance.post.bind(instance);
		enrichedInstance.put = instance.put.bind(instance);
		enrichedInstance.patch = instance.patch.bind(instance);

		enrichedInstance.setBaseURL = instance.setBaseURL.bind(instance);
		enrichedInstance.setHeader = instance.setHeader.bind(instance);
		enrichedInstance.create = instance.create.bind(instance);

		enrichedInstance.isAxiosError = instance.isAxiosError.bind(instance);
		enrichedInstance.CancelToken = CancelToken;
		enrichedInstance.isCancel = instance.isCancel.bind(instance);
		enrichedInstance.Cancel = Cancel;

		return enrichedInstance;
	}
}

export type AxiosInstance = Omit<AxiosWrapper, 'defaults'> &
	AxiosWrapper['request'] & { defaults: HaxiosOptions } & { Cancel: typeof Cancel };

const enrichedInstance: AxiosStatic = AxiosWrapper.create() as AxiosStatic;

export type AxiosStatic = AxiosInstance;

enrichedInstance.isAxiosError = (err: any): err is GaxiosError => err instanceof GaxiosError;
enrichedInstance.CancelToken = CancelToken;
enrichedInstance.isCancel = CancelToken.isCancel;
enrichedInstance.Cancel = Cancel;

export default enrichedInstance;
