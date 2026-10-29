/** Stop waiting on an operation when cancelled; its eventual rejection is still observed. */
export function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
  if (!signal) return operation
  if (signal.aborted) {
    void operation.catch(() => undefined)
    return Promise.resolve(undefined)
  }
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      resolve(undefined)
    }
    signal.addEventListener('abort', abort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
  })
}
