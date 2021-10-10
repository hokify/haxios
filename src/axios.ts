import { GaxiosOptions, GaxiosResponse, RetryConfig } from 'gaxios';
import type { CancelToken } from './CancelToken';

export interface HAxiosRequestConfig<D = any> extends AxiosConfig {
	data?: D;
	onDownloadProgress?: (progressEvent: any) => void;
	withCredentials?: boolean;
}

type GaxiosXMLHttpRequest = GaxiosResponse['request']

export interface HaxiosRequest extends GaxiosXMLHttpRequest {
	path: string;
}

export interface HAxiosResponse<T = any, D = any> extends Omit<GaxiosResponse<T>, 'request'> {
	config: HAxiosRequestConfig<D>;
	request?: HaxiosRequest;
}

export interface AxiosProxyConfig {
	host: string;
	port: number;
	auth?: {
		username: string;
		password: string;
	};
	protocol?: string;
}
export type AxiosResponseHeaders = Record<string, string> & {
	'set-cookie'?: string[];
};

/**
export interface AxiosRequestTransformer {
    (data: any, headers?: AxiosRequestHeaders): any;
}

export interface AxiosResponseTransformer {
    (data: any, headers?: AxiosResponseHeaders): any;
}*/

export interface AxiosPromise<T = any> extends Promise<HAxiosResponse> {}

export type AxiosAdapter = <T = any>(options: AxiosConfig, defaultAdapter: (options: AxiosConfig) => AxiosPromise<T>) => AxiosPromise<T>;

export interface AxiosConfig extends Omit<GaxiosOptions, 'baseUrl'> {
	// if withCredentials is true, it's set to include
	credentials?: 'omit' | 'same-origin' | 'include';

	retry?: boolean;
	retryConfig?: RetryConfig;
	// maps to credentials: include
	withCredentials?: boolean;
	// basic auth
	auth?: {
		username: string;
		password: string;
	};

	/* NEEDS MORE OWRK */
	// not implemented
	transformRequest?: never; // AxiosRequestTransformer | AxiosRequestTransformer[];
	// not implemented
	transformResponse?: never; // AxiosResponseTransformer | AxiosResponseTransformer[];
	// not implemented
	timeoutErrorMessage?: string;

	// ??
	xsrfCookieName?: string;
	// ??
	xsrfHeaderName?: string;
	// not workig right now
	onDownloadProgress?: (progressEvent: any) => void;
	// does nothing
	maxBodyLength?: number;
	// not working
	socketPath?: string | null;
	// useless
	httpAgent?: any;
	// useless
	httpsAgent?: any;
	// accoridng to test suite not working right onw
	proxy?: AxiosProxyConfig | false;
	// needs also more work
	cancelToken?: CancelToken;
	// useless? not implenented at leat
	decompress?: boolean;
}
