import { GaxiosOptions, GaxiosResponse, RetryConfig } from 'gaxios';

export interface HAxiosRequestConfig<D = any> extends AxiosConfig {
	data?: D;
	onDownloadProgress?: (progressEvent: any) => void;
	withCredentials?: boolean;
	// if withCredentials is true, it's set to include
	credentials?: 'omit' | 'same-origin' | 'include';
}

export interface HAxiosResponse<T = any, D = any> extends GaxiosResponse<T> {
	config: HAxiosRequestConfig<D>;
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

export interface Cancel {
	message: string;
}

export interface CancelToken {
	promise: Promise<Cancel>;
	reason?: Cancel;
	throwIfRequested(): void;
}

export interface AxiosConfig extends Omit<GaxiosOptions, 'baseUrl'> {
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
