export type ResultFunction<T = any> = (param: T) => T | Promise<T> | void;

export type InterceptorHandler = {id: number, fulfilled?: ResultFunction, rejected?: ResultFunction; synchronous?: boolean; runWhen?: any};

export class InterceptorManager {
  private handlers: InterceptorHandler[] = []

  /**
   * Add a new interceptor to the stack
   *
   * @param {Function} fulfilled The function to handle `then` for a `Promise`
   * @param {Function} rejected The function to handle `reject` for a `Promise`
   *
   * @return {Number} An ID used to remove interceptor later
   */
  use (fulfilled?: ResultFunction, rejected?: ResultFunction, options?: {synchronous?: boolean; runWhen?: any}): number {
    const id = this.handlers.length
    this.handlers.push({
      id,
      fulfilled,
      rejected,
      synchronous: options?.synchronous,
      runWhen: options?.runWhen
    })
    return this.handlers.length - 1
  }

  /**
   * Remove an interceptor from the stack
   *
   * @param {Number} id The ID that was returned by `use`
   */
  eject (id: number) {
    const entry = this.handlers.findIndex(elm => elm.id === id)
    if (entry !== -1) {
      this.handlers.splice(entry, 1)
    }
  }

  /**
   * Iterate over all the registered interceptors
   *
   * This method is particularly useful for skipping over any
   * interceptors that may have become `null` calling `eject`.
   *
   * @param {Function} fn The function to call for each interceptor
   */
  forEach (fn: (h: any) => unknown) {
    this.handlers.forEach(function forEachHandler (h) {
      if (h !== null) {
        fn(h)
      }
    })
  }
}
