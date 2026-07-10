import { EventType, Emitter } from 'mitt'
import { SubscriptionStreamClosed } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

// TODO: Choose a proper value based on real metrics from peak queue sizes in production.
export const MAX_VALUE_QUEUE_SIZE = 1000

export type DestroyableAsyncGenerator<T> = AsyncGenerator<T> & {
  destroy(closeReason?: SubscriptionStreamClosed): void
  /**
   * Why destroy() ended the generator, when the caller provided a reason. Consumers read it
   * after their iteration loop completes to send the client a final "stream closed" message.
   * Undefined for consumer-initiated ends (return()) and reasonless destroys.
   */
  getCloseReason(): SubscriptionStreamClosed | undefined
}

/**
 * Turns an `EventEmitter` into an `AsyncGenerator`
 * @param emitter `Emitter` from `mitt` package
 * @param event type of event to listen to
 * @returns `DestroyableAsyncGenerator`
 */
export default function emitterToAsyncGenerator<Events extends Record<EventType, unknown>, T extends keyof Events>(
  emitter: Emitter<Events>,
  event: T,
  onOverflowDrop?: () => void
): DestroyableAsyncGenerator<Events[T]> {
  let isDone = false
  let closeReason: SubscriptionStreamClosed | undefined
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
      // Drop the oldest event to prevent unbounded memory growth for a slow consumer. Surface it
      // via the optional hook so callers can track how often (and for which event) updates are
      // being lost — a sustained rate means a client isn't keeping up with the stream.
      valueQueue.shift()
      onOverflowDrop?.()
    }
    valueQueue.push(value)
  }

  emitter.on(event, eventHandler)

  /**
   * Synchronously terminates the generator from outside the consumer loop.
   * Resolves any pending next() calls with { done: true } and removes the handler.
   * The optional reason is recorded (first call wins) so the consumer can inform
   * the client why the stream ended.
   */
  function destroy(reason?: SubscriptionStreamClosed): void {
    if (isDone) return
    isDone = true
    closeReason = reason
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
    destroy,
    getCloseReason: () => closeReason
  }
}
