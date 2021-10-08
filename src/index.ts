import { AbortSignal } from 'abort-controller';

import * as Gaxios from 'gaxios'
import { InterceptorHandler, InterceptorManager } from './InterceptorManager'
import {AxiosConfig, HAxiosRequestConfig, HAxiosResponse} from "./axios";
import {GaxiosOptions} from "gaxios";

export * from './axios';

export class AxiosWrapper {
  private gaxiosInstance: Gaxios.Gaxios;

  private transformAxiosConfigToGaxios(config: AxiosConfig): GaxiosOptions {
    return {
      ...config,
      signal: config.signal ? config.signal as AbortSignal : undefined,
      adapter: config.adapter !== undefined ? (config, defaultAdapter) => config.adapter!(config, defaultAdapter) : undefined,
      validateStatus: config.validateStatus ? config.validateStatus : undefined
    }
  }

  constructor (config: AxiosConfig = {}) {
    const gaxiosConfig = this.transformAxiosConfigToGaxios(config);
    this.gaxiosInstance = new Gaxios.Gaxios({
      ...gaxiosConfig,
      // set baseURL on request time
      baseURL: ''
    })

    this.config = gaxiosConfig;
  }

  config: HAxiosRequestConfig;

  interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager()
  }

  request<T = unknown, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any> (requestParams: HAxiosRequestConfig<D>): Promise<R> {
    if (!requestParams.url?.startsWith('http://') && !requestParams.url?.startsWith('https://')) {
      requestParams.baseURL = this.config.baseURL
      // sanitize baseURL
      if (!requestParams.baseURL?.endsWith('/') && !requestParams.url?.startsWith("/")) {
        requestParams.baseURL += '/'
      }
    }

    if (requestParams.withCredentials) {
      requestParams.credentials = 'include';
    }

    // filter out skipped interceptors
    const requestInterceptorChain: any[] = []
    let synchronousRequestInterceptors = true
    this.interceptors.request.forEach(function unshiftRequestInterceptors (interceptor: InterceptorHandler) {
      if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(requestParams) === false) {
        return
      }

      synchronousRequestInterceptors = !!(synchronousRequestInterceptors && interceptor.synchronous)

      requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected)
    })

    const responseInterceptorChain: any[] = []
    this.interceptors.response.forEach(function pushResponseInterceptors (interceptor) {
      responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected)
    })

    let promise: Promise<any>

    if (!synchronousRequestInterceptors) {
      let chain = [this.gaxiosInstance.request.bind(this.gaxiosInstance), undefined]

      Array.prototype.unshift.apply(chain, requestInterceptorChain)
      chain = chain.concat(responseInterceptorChain)

      promise = Promise.resolve(requestParams)

      while (chain.length) {
        promise = promise.then(chain.shift(), chain.shift())
      }

      return promise
    }

    let newConfig = { ...requestParams }
    while (requestInterceptorChain.length) {
      const onFulfilled = requestInterceptorChain.shift()
      const onRejected = requestInterceptorChain.shift()
      try {
        newConfig = onFulfilled(newConfig)
      } catch (error) {
        onRejected(error)
        break
      }
    }

    try {
      promise = this.gaxiosInstance.request(newConfig)
    } catch (error) {
      return Promise.reject(error)
    }

    while (responseInterceptorChain.length) {
      promise = promise.then(responseInterceptorChain.shift(), responseInterceptorChain.shift())
    }

    return promise
  }

  getUri<T = unknown, R extends HAxiosResponse<T> = HAxiosResponse<T>> (config: HAxiosRequestConfig): Promise<R> {
    return this.request(config)
  }

  get<T = unknown, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any> (url: string, config?: HAxiosRequestConfig<D>): Promise<R> {
    return this.request({ url, method: 'GET', ...config })
  }

  delete<T = unknown, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any> (url: string, config?: HAxiosRequestConfig<D>): Promise<R> {
    return this.request({ url, method: 'DELETE', ...config })
  }

  head<T = unknown, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any> (url: string, config?: HAxiosRequestConfig<D>): Promise<R> {
    return this.request({ url, method: 'HEAD', ...config })
  }

  options<T = unknown, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any> (url: string, config?: HAxiosRequestConfig<D>): Promise<R> {
    return this.request({ url, method: 'OPTIONS', ...config })
  }

  post<T = unknown, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any> (url: string, data?: D, config?: HAxiosRequestConfig<D>): Promise<R> {
    return this.request({ url, method: 'POST', ...config })
  }

  put<T = unknown, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any> (url: string, data?: D, config?: HAxiosRequestConfig<D>): Promise<R> {
    return this.request({ url, method: 'PUT', ...config })
  }

   patch<T = unknown, R extends HAxiosResponse<T> = HAxiosResponse<T>, D = any> (url: string, data?: D, config?: HAxiosRequestConfig<D>): Promise<R> {
    return this.request({ url, method: 'PATCH', ...config })
  }

  setBaseURL (baseURL: string) {
    this.config.baseURL = baseURL
  }

  setHeader (name: string, value: string) {
    if (!value) {
      delete this.config.headers?.[name]
      return;
    }
    if (!this.config.headers) {
      this.config.headers = {}
    }
    this.config.headers[name] = value
  }

  create (config?: AxiosConfig) {
    return new AxiosWrapper(config)
  }
}

const instance = new AxiosWrapper()

export default {
  ...instance,
  request: instance.request.bind(instance),

  getUri: instance.getUri.bind(instance),

  get: instance.get.bind(instance),

  delete: instance.delete.bind(instance),

  head: instance.head.bind(instance),

  options: instance.options.bind(instance),

  post: instance.post.bind(instance),

  put: instance.put.bind(instance),

  patch: instance.patch.bind(instance),

  setBaseURL: instance.setBaseURL.bind(instance),
  setHeader: instance.setHeader.bind(instance),

  create: instance.create.bind(instance)
}
