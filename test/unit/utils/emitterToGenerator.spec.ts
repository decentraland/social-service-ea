import mitt, { Emitter } from 'mitt'
import emitterToAsyncGenerator, { MAX_VALUE_QUEUE_SIZE } from '../../../src/utils/emitterToGenerator'

type TestEvents = {
  testEvent: string
}

describe('emitterToAsyncGenerator', () => {
  let emitter: Emitter<TestEvents>

  beforeEach(() => {
    emitter = mitt<TestEvents>()
  })

  it('should yield events emitted on the specified event type', async () => {
    const generator = emitterToAsyncGenerator(emitter, 'testEvent')

    // Emit an event
    const emittedValue = 'Hello, World!'
    emitter.emit('testEvent', emittedValue)

    // Consume the generator
    const result = await generator.next()

    expect(result.value).toBe(emittedValue)
    expect(result.done).toBe(false)
  })

  it('should queue events until next() is called', async () => {
    const generator = emitterToAsyncGenerator(emitter, 'testEvent')

    // Emit multiple events
    const emittedValues = ['Event 1', 'Event 2', 'Event 3']
    emittedValues.forEach((value) => emitter.emit('testEvent', value))

    // Consume the generator
    for (const expectedValue of emittedValues) {
      const result = await generator.next()
      expect(result.value).toBe(expectedValue)
      expect(result.done).toBe(false)
    }
  })

  it('should block on next() until an event is emitted', async () => {
    const generator = emitterToAsyncGenerator(emitter, 'testEvent')

    const emittedValue = 'Delayed Event'

    // Simulate a delayed event
    setTimeout(() => emitter.emit('testEvent', emittedValue), 100)

    const result = await generator.next()
    expect(result.value).toBe(emittedValue)
    expect(result.done).toBe(false)
  })

  it('should handle return() to terminate the generator', async () => {
    const generator = emitterToAsyncGenerator(emitter, 'testEvent')

    const result = await generator.return('Completed')
    expect(result.value).toBe('Completed')
    expect(result.done).toBe(true)
  })

  it('should handle throw() to propagate an error', async () => {
    const generator = emitterToAsyncGenerator(emitter, 'testEvent')

    const error = new Error('Test error')

    await expect(generator.throw(error)).rejects.toThrow('Test error')
  })

  it('should handle no events being emitted gracefully', async () => {
    const generator = emitterToAsyncGenerator(emitter, 'testEvent')

    const promise = generator.next()
    expect(promise).toBeInstanceOf(Promise) // Ensure it waits indefinitely
  })

  it('should process events in order when emitted rapidly', async () => {
    const generator = emitterToAsyncGenerator(emitter, 'testEvent')

    // Emit events rapidly
    const emittedValues = ['Event A', 'Event B', 'Event C']
    emittedValues.forEach((value) => emitter.emit('testEvent', value))

    const results = []
    for (let i = 0; i < emittedValues.length; i++) {
      const result = await generator.next()
      results.push(result.value)
    }

    expect(results).toEqual(emittedValues)
  })

  it('should allow multiple consumers with separate generators', async () => {
    const generator1 = emitterToAsyncGenerator(emitter, 'testEvent')
    const generator2 = emitterToAsyncGenerator(emitter, 'testEvent')

    const emittedValue1 = 'Generator 1 Event'
    const emittedValue2 = 'Generator 2 Event'

    emitter.emit('testEvent', emittedValue1)
    emitter.emit('testEvent', emittedValue2)

    const [result11, result12, result21, result22] = await Promise.all([
      generator1.next(),
      generator1.next(),
      generator2.next(),
      generator2.next()
    ])

    expect(result11.value).toBe(emittedValue1)
    expect(result11.done).toBe(false)

    expect(result12.value).toBe(emittedValue2)
    expect(result12.done).toBe(false)

    expect(result21.value).toBe(emittedValue1)
    expect(result21.done).toBe(false)

    expect(result22.value).toBe(emittedValue2)
    expect(result22.done).toBe(false)
  })

  it('should return done:true for next() after generator is done', async () => {
    const generator = emitterToAsyncGenerator(emitter, 'testEvent')

    // First mark the generator as done by calling return()
    await generator.return('Completed')

    // Now verify that next() returns done:true
    const result = await generator.next()
    expect(result.done).toBe(true)
    expect(result.value).toBeUndefined()

    // Verify that emitting new events doesn't affect the done generator
    emitter.emit('testEvent', 'New Event')
    const result2 = await generator.next()
    expect(result2.done).toBe(true)
    expect(result2.value).toBeUndefined()
  })

  describe('when next() is called while waiting for an event', () => {
    let generator: ReturnType<typeof emitterToAsyncGenerator<TestEvents, 'testEvent'>>
    let pendingNext: Promise<IteratorResult<string>>

    beforeEach(() => {
      generator = emitterToAsyncGenerator(emitter, 'testEvent')
      pendingNext = generator.next()
    })

    describe('and return() is called before any event is emitted', () => {
      it('should resolve the pending next() with done: true without hanging', async () => {
        await generator.return('done')

        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timed out: pending next() was never resolved')), 1000)
        )
        const result = await Promise.race([pendingNext, timeout])

        expect(result.done).toBe(true)
      })
    })

    describe('and throw() is called before any event is emitted', () => {
      it('should reject the pending next() with the thrown error without hanging', async () => {
        const error = new Error('thrown while waiting')
        await generator.throw(error).catch(() => {})

        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timed out: pending next() was never rejected')), 1000)
        )
        await expect(Promise.race([pendingNext, timeout])).rejects.toThrow('thrown while waiting')
      })
    })
  })

  describe('destroy()', () => {
    it('should resolve pending next() with done: true', async () => {
      const generator = emitterToAsyncGenerator(emitter, 'testEvent')

      const pendingNext = generator.next()
      generator.destroy()

      // destroy() is synchronous, so the pending next() resolves immediately
      const result = await pendingNext
      expect(result.done).toBe(true)
    })

    it('should clear valueQueue', async () => {
      const generator = emitterToAsyncGenerator(emitter, 'testEvent')

      emitter.emit('testEvent', 'queued-event')
      generator.destroy()

      const result = await generator.next()
      expect(result.done).toBe(true)
      expect(result.value).toBeUndefined()
    })

    it('should make subsequent next() return done: true', async () => {
      const generator = emitterToAsyncGenerator(emitter, 'testEvent')
      generator.destroy()

      const result = await generator.next()
      expect(result.done).toBe(true)
      expect(result.value).toBeUndefined()
    })

    it('should be idempotent', () => {
      const generator = emitterToAsyncGenerator(emitter, 'testEvent')
      generator.destroy()
      expect(() => generator.destroy()).not.toThrow()
    })

    it('should stop receiving events after destroy', async () => {
      const generator = emitterToAsyncGenerator(emitter, 'testEvent')
      generator.destroy()

      emitter.emit('testEvent', 'after-destroy')
      const result = await generator.next()
      expect(result.done).toBe(true)
    })
  })

  describe('valueQueue cap', () => {
    it('should drop oldest events when exceeding MAX_VALUE_QUEUE_SIZE', async () => {
      const generator = emitterToAsyncGenerator(emitter, 'testEvent')

      // Fill beyond the cap
      for (let i = 0; i < MAX_VALUE_QUEUE_SIZE + 10; i++) {
        emitter.emit('testEvent', `event-${i}`)
      }

      // The first 10 events should have been dropped
      const result = await generator.next()
      expect(result.value).toBe('event-10')
    })

    it('should keep exactly MAX_VALUE_QUEUE_SIZE items when overflowing', async () => {
      const generator = emitterToAsyncGenerator(emitter, 'testEvent')
      const overflow = 5

      for (let i = 0; i < MAX_VALUE_QUEUE_SIZE + overflow; i++) {
        emitter.emit('testEvent', `event-${i}`)
      }

      // Consume exactly MAX_VALUE_QUEUE_SIZE items (the cap)
      for (let i = 0; i < MAX_VALUE_QUEUE_SIZE; i++) {
        const result = await generator.next()
        expect(result.done).toBe(false)
      }

      // Queue should now be empty — destroy and confirm no more items
      generator.destroy()
      const result = await generator.next()
      expect(result.done).toBe(true)
    })
  })
})
