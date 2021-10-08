import {GaxiosOptions, GaxiosResponse, RetryConfig} from 'gaxios'

export interface HAxiosRequestConfig<D = any> extends GaxiosOptions {
    data?: D;
    onDownloadProgress?: (progressEvent: any) => void;
    withCredentials?: boolean;
    // if withCredentials is true, it's set to include
    credentials?: 'omit' | 'same-origin' | 'include';
}

export interface HAxiosResponse<T = unknown, D = any> extends GaxiosResponse<T> {
    config: HAxiosRequestConfig<D>;
}

export type Method =
    | 'get' | 'GET'
    | 'delete' | 'DELETE'
    | 'head' | 'HEAD'
    | 'options' | 'OPTIONS'
    | 'post' | 'POST'
    | 'put' | 'PUT'
    | 'patch' | 'PATCH'
    | 'purge' | 'PURGE'
    | 'link' | 'LINK'
    | 'unlink' | 'UNLINK'

export interface AxiosProxyConfig {
    host: string;
    port: number;
    auth?: {
        username: string;
        password:string;
    };
    protocol?: string;
}
export type AxiosRequestHeaders = Record<string, string>

export type AxiosResponseHeaders = Record<string, string> & {
    "set-cookie"?: string[]
}

export interface AxiosRequestTransformer {
    (data: any, headers?: AxiosRequestHeaders): any;
}

export interface AxiosResponseTransformer {
    (data: any, headers?: AxiosResponseHeaders): any;
}


export interface AxiosAdapter {
    (config: AxiosRequestConfig): Promise<AxiosResponse<any>>;
}

export interface AxiosBasicCredentials {
    username: string;
    password: string;
}

export interface AxiosResponse<T = unknown, D = any>  {
    data: T;
    status: number;
    statusText: string;
    headers: AxiosResponseHeaders;
    config: AxiosRequestConfig<D>;
    request?: any;
}

export interface Cancel {
    message: string;
}

export interface CancelToken {
    promise: Promise<Cancel>;
    reason?: Cancel;
    throwIfRequested(): void;
}

export interface TransitionalOptions{
    silentJSONParsing: boolean;
    forcedJSONParsing: boolean;
    clarifyTimeoutError: boolean;
}

export type ResponseType =
    | 'arraybuffer'
    | 'blob'
    | 'document'
    | 'json'
    | 'text'
    | 'stream'

export interface AxiosRequestConfig<D = any>  extends AxiosConfig {
    url?: string;
    method?: Method;
    data?: D;
    params?: any;
    responseType?: ResponseType;
}

export interface AxiosConfig extends Omit<GaxiosOptions, 'method' | 'responseType' | 'validateStatus' | 'signal' | 'adapter'> {
    baseURL?: string;
    transformRequest?: AxiosRequestTransformer | AxiosRequestTransformer[];
    transformResponse?: AxiosResponseTransformer | AxiosResponseTransformer[];
    headers?: AxiosRequestHeaders;
    paramsSerializer?: (params: any) => string;
    timeout?: number;
    timeoutErrorMessage?: string;
    withCredentials?: boolean;
    adapter?: AxiosAdapter;
    auth?: AxiosBasicCredentials;
    xsrfCookieName?: string;
    xsrfHeaderName?: string;
    onUploadProgress?: (progressEvent: any) => void;
    onDownloadProgress?: (progressEvent: any) => void;
    maxContentLength?: number;
    validateStatus?: ((status: number) => boolean) | null;
    maxBodyLength?: number;
    maxRedirects?: number;
    socketPath?: string | null;
    httpAgent?: any;
    httpsAgent?: any;
    proxy?: AxiosProxyConfig | false;
    cancelToken?: CancelToken;
    decompress?: boolean;
    transitional?: TransitionalOptions;
    signal?: AbortSignal;
    retry?: boolean;
    retryConfig?: RetryConfig;
}