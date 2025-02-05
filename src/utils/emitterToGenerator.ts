import { EventType, Emitter } from 'mitt'

/**
 * Turns an `EventEmitter` into an `AsyncGenerator`
 * @param emitter `Emitter` from `mitt` package
 * @param event type of event to listen to
 * @returns `AsyncGenerator`
 */
export default function emitterToAsyncGenerator<Events extends Record<EventType, unknown>, T extends keyof Events>(
  emitter: Emitter<Events>,
  event: T
): AsyncGenerator<Events[T]> {
  let isDone = false
  const nextQueue: {
    resolve: (value: IteratorResult<Events[T], any> | PromiseLike<IteratorResult<Events[T], any>>) => void
    reject: (reason?: any) => void
  }[] = []
  const valueQueue: Events[T][] = []

  function eventHandler(value: Events[T]) {
    if (isDone) return

    if (nextQueue.length > 0) {
      const { resolve } = nextQueue.shift()!
      resolve({ done: false, value })
      return
    }
    valueQueue.push(value)
  }

  emitter.on(event, eventHandler)

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
      isDone = true
      emitter.off(event, eventHandler)
      return {
        done: true,
        value
      }
    },
    async throw(e) {
      isDone = true
      emitter.off(event, eventHandler)
      throw e
    }
  }
}
