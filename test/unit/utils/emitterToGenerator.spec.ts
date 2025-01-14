import mitt, { Emitter } from 'mitt'
import emitterToAsyncGenerator from '../../../src/utils/emitterToGenerator'

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
})
