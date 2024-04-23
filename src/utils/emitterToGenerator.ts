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
  const isDone = false
  const nextQueue: {
    resolve: (value: IteratorResult<Events[T], any> | PromiseLike<IteratorResult<Events[T], any>>) => void
    reject: (reason?: any) => void
  }[] = []
  const valueQueue: Events[T][] = []

  function eventHandler(value: Events[T]) {
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
      if (valueQueue.length) {
        const value = valueQueue.shift()!
        return {
          done: isDone && valueQueue.length === 0,
          value
        }
      }

      return new Promise((resolve, reject) => {
        nextQueue.push({ resolve, reject })
      })
    },
    async return(value) {
      return {
        done: true,
        value
      }
    },
    async throw(e) {
      throw e
    }
  }
}
