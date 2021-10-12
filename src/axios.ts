import { GaxiosOptions, GaxiosResponse, RetryConfig } from 'gaxios';
import type { CancelToken } from './CancelToken';

type HaxiosRequestArrayBufferConfig<D> = HAxiosRequestConfigBase<D> & {
	responseType: 'arraybuffer';
};
type HaxiosRequestJsonConfig<D> = HAxiosRequestConfigBase<D> & {
	responseType?: 'json' | undefined;
};
type HaxiosRequestTextConfig<D> = HAxiosRequestConfigBase<D> & { responseType: 'text' };
type HaxiosRequestStreamConfig<D> = HAxiosRequestConfigBase<D> & { responseType: 'stream' };
type HaxiosRequestBlobConfig<D> = HAxiosRequestConfigBase<D> & { responseType: 'blob' };

export type HAxiosRequestConfig<D = any> =
	| HaxiosRequestArrayBufferConfig<D>
	| HaxiosRequestJsonConfig<D>
	| HaxiosRequestTextConfig<D>
	| HaxiosRequestStreamConfig<D>
	| HaxiosRequestBlobConfig<D>;

export interface HAxiosRequestConfigBase<D = any> extends Omit<AxiosConfig, 'responseType'> {
	data?: D;
	onDownloadProgress?: (progressEvent: any) => void;
	withCredentials?: boolean;
}

type GaxiosXMLHttpRequest = GaxiosResponse['request'];

export interface HaxiosRequest extends GaxiosXMLHttpRequest {
	path: string;
}

type HaxiosRETURN<RETURN, INPUT, CONFIG> = CONFIG extends HaxiosRequestArrayBufferConfig<INPUT>
	? ArrayBuffer
	: CONFIG extends HaxiosRequestJsonConfig<INPUT>
		? RETURN
		: CONFIG extends HaxiosRequestTextConfig<INPUT>
			? string
			: CONFIG extends HaxiosRequestStreamConfig<INPUT>
				? ReadableStream
				: unknown

export interface HAxiosResponse<RETURN = any, INPUT = any, CONFIG extends HAxiosRequestConfig<INPUT> = HaxiosRequestJsonConfig<INPUT>>
	extends Omit<
		GaxiosResponse<
			HaxiosRETURN<RETURN,INPUT,CONFIG>
		>,
		'request'
	> {
	config: HAxiosRequestConfig<INPUT>;
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

export interface AxiosPromise<RETURN = any> extends Promise<HAxiosResponse> {}

export type AxiosAdapter = <RETURN = any>(
	options: AxiosConfig,
	defaultAdapter: (options: AxiosConfig) => AxiosPromise<RETURN>
) => AxiosPromise<RETURN>;

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
