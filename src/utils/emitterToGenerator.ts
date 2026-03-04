import { EventType, Emitter } from 'mitt'

// TODO: Choose a proper value based on real metrics from peak queue sizes in production.
export const MAX_VALUE_QUEUE_SIZE = 1000

export type DestroyableAsyncGenerator<T> = AsyncGenerator<T> & { destroy(): void }

/**
 * Turns an `EventEmitter` into an `AsyncGenerator`
 * @param emitter `Emitter` from `mitt` package
 * @param event type of event to listen to
 * @returns `DestroyableAsyncGenerator`
 */
export default function emitterToAsyncGenerator<Events extends Record<EventType, unknown>, T extends keyof Events>(
  emitter: Emitter<Events>,
  event: T
): DestroyableAsyncGenerator<Events[T]> {
  let isDone = false
  const nextQueue: {
    resolve: (value: IteratorResult<Events[T], any> | PromiseLike<IteratorResult<Events[T], any>>) => void
    reject: (reason?: any) => void
  }[] = []
  const valueQueue: Events[T][] = []

  function eventHandler(value: Events[T]) {
    if (isDone) {
      return
    }

    if (nextQueue.length > 0) {
      const { resolve } = nextQueue.shift()!
      resolve({ done: false, value })
      return
    }

    if (valueQueue.length >= MAX_VALUE_QUEUE_SIZE) {
      // Drop oldest event silently to prevent unbounded memory growth.
      // TODO: Add metrics/logging here once a logger is available in this utility.
      valueQueue.shift()
    }
    valueQueue.push(value)
  }

  emitter.on(event, eventHandler)

  /**
   * Synchronously terminates the generator from outside the consumer loop.
   * Resolves any pending next() calls with { done: true } and removes the handler.
   */
  function destroy(): void {
    if (isDone) return
    isDone = true
    emitter.off(event, eventHandler)
    while (nextQueue.length > 0) {
      const { resolve } = nextQueue.shift()!
      resolve({ done: true, value: undefined })
    }
    valueQueue.length = 0
  }

  return {
    [Symbol.asyncIterator]() {
      return this
    },
    async next() {
      if (isDone) {
        return { done: true, value: undefined }
      }

      if (valueQueue.length) {
        const value = valueQueue.shift()!
        return { done: false, value }
      }

      return new Promise((resolve, reject) => {
        nextQueue.push({ resolve, reject })
      })
    },
    async return(value) {
      destroy()
      return {
        done: true,
        value
      }
    },
    // Note: throw() intentionally does NOT delegate to destroy() because
    // destroy() resolves pending next() calls, while throw() must reject them.
    // Callers should ensure unregisterGenerator() is called separately (the
    // finally block in handleSubscriptionUpdates handles this).
    async throw(e) {
      isDone = true
      emitter.off(event, eventHandler)
      valueQueue.length = 0
      while (nextQueue.length > 0) {
        const { reject } = nextQueue.shift()!
        reject(e)
      }
      throw e
    },
    destroy
  }
}
