import { AbortSignal } from 'abort-controller';

import * as Gaxios from 'gaxios';
import { InterceptorHandler, InterceptorManager } from './InterceptorManager';
import { AxiosConfig, HAxiosRequestConfig, HAxiosResponse } from './axios';
import { GaxiosError, GaxiosOptions } from 'gaxios';
import { GaxiosResponse } from 'gaxios/build/src/common';
import { CancelToken } from './CancelToken';

export * from './axios';

export { GaxiosError as AxiosError };
export type { HAxiosResponse as AxiosResponse };
export type { HAxiosRequestConfig as AxiosRequestConfig };

export type Method = GaxiosOptions['method'];

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
export class AxiosWrapper {
	private gaxiosInstance: Gaxios.Gaxios;

	baseURL?: string;

	private transformAxiosConfigToGaxios(config: AxiosConfig): GaxiosOptions {
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

		// HTTP basic authentication
		if (config.auth) {
			var username = config.auth.username || '';
			var password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';

			if (!config.headers) config.headers = {};
			// todo: get rid of btoa
			config.headers.Authorization = 'Basic ' + btoa(username + ':' + password);
		}


		if (config.withCredentials) {
			config.credentials = 'include';
		}

		const setContentTypeIfUnset = (contentType: string) => {
			if (!config.headers) config.headers = {};

			config.headers['Content-Type'] = contentType;
		};

		if (typeof URLSearchParams !== 'undefined' && config.data instanceof URLSearchParams) {
			setContentTypeIfUnset('application/x-www-form-urlencoded;charset=utf-8');
			config.data = config.data.toString();

			console.log('config.headers[\'Content-Type\']', config.headers?.['Content-Type']);
		}

		if (
			(config.data !== null && typeof config.data === 'object') ||
			// this condition doesn't fully make sense to me, but it's the
			// same logic as in axios: https://github.com/axios/axios/blob/76f09afc03fbcf392d31ce88448246bcd4f91f8c/lib/defaults.js#L74
			config.headers?.['Content-Type'] === 'application/json'
		) {
			setContentTypeIfUnset('application/json');
			config.data = JSON.stringify(config.data);
		}

		return config;
	}

	constructor(config: AxiosConfig = {}) {
		const gaxiosConfig = this.transformAxiosConfigToGaxios(config);
		this.gaxiosInstance = new Gaxios.Gaxios({
			...gaxiosConfig,
			// set baseURL on request time
			baseURL: ''
		});

		this.baseURL = gaxiosConfig.baseURL;
	}

	get defaults() {
		return this.gaxiosInstance.defaults;
	}

	interceptors = {
		request: new InterceptorManager(),
		response: new InterceptorManager()
	};

	async request<T = any, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any>(
		requestParams: HAxiosRequestConfig<D>
	): Promise<R> {
		try {
			if (!requestParams.url?.startsWith('http://') && !requestParams.url?.startsWith('https://')) {
				requestParams.baseURL = this.baseURL;
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

	getUri<T = any, R extends HAxiosResponse<T> = HAxiosResponse<T>>(
		config: HAxiosRequestConfig
	): Promise<R> {
		return this.request(config);
	}

	get<T = any, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any>(
		url: string,
		config?: HAxiosRequestConfig<D>
	): Promise<R> {
		return this.request({ url, method: 'GET', ...config });
	}

	delete<T = any, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any>(
		url: string,
		config?: HAxiosRequestConfig<D>
	): Promise<R> {
		return this.request({ url, method: 'DELETE', ...config });
	}

	head<T = any, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any>(
		url: string,
		config?: HAxiosRequestConfig<D>
	): Promise<R> {
		return this.request({ url, method: 'HEAD', ...config });
	}

	options<T = any, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any>(
		url: string,
		config?: HAxiosRequestConfig<D>
	): Promise<R> {
		return this.request({ url, method: 'OPTIONS', ...config });
	}

	post<T = any, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any>(
		url: string,
		data?: D,
		config?: HAxiosRequestConfig<D>
	): Promise<R> {
		return this.request({ url, method: 'POST', data, ...config });
	}

	put<T = any, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any>(
		url: string,
		data?: D,
		config?: HAxiosRequestConfig<D>
	): Promise<R> {
		return this.request({ url, method: 'PUT', data, ...config });
	}

	patch<T = any, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any>(
		url: string,
		data?: D,
		config?: HAxiosRequestConfig<D>
	): Promise<R> {
		return this.request({ url, method: 'PATCH', data, ...config });
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

	create(config?: AxiosConfig) {
		return new AxiosWrapper(config);
	}
}

const instance = new AxiosWrapper();

interface AxiosPromise<T = any> extends Promise<HAxiosResponse> {}
export type { AxiosPromise, AxiosWrapper as AxiosInstance };

export type AxiosStatic = AxiosWrapper &
	AxiosWrapper['request'] & {
		isAxiosError: (err: any) => err is GaxiosError;
	} & { CancelToken: typeof CancelToken };

const enrichedInstance: AxiosStatic = instance.request.bind(instance) as any;
enrichedInstance.interceptors = instance.interceptors;

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
enrichedInstance.isAxiosError = (err: any): err is GaxiosError => err instanceof GaxiosError;
enrichedInstance.CancelToken = CancelToken;

export default enrichedInstance;
