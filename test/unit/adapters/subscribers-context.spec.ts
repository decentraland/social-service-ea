import { createSubscribersContext } from '../../../src/adapters/rpc-server/subscribers-context'
import mitt from 'mitt'
import { SubscriptionEventsEmitter } from '../../../src/types'

describe('SubscribersContext Component', () => {
  function createTestContext() {
    return {
      context: createSubscribersContext(),
      subscriber: mitt<SubscriptionEventsEmitter>(),
      address: '0x123'
    }
  }

  describe('initialization', () => {
    it('should initialize with empty subscribers', () => {
      const { context } = createTestContext()
      expect(context.getSubscribers()).toEqual({})
    })
  })

  describe('subscriber management', () => {
    describe('adding subscribers', () => {
      it('should add a new subscriber', () => {
        const { context, subscriber, address } = createTestContext()

        context.addSubscriber(address, subscriber)

        expect(context.getSubscribers()[address]).toBe(subscriber)
      })

      it('should preserve existing subscriber when adding duplicate', () => {
        const { context, subscriber, address } = createTestContext()
        const newSubscriber = mitt<SubscriptionEventsEmitter>()

        context.addSubscriber(address, subscriber)
        context.addSubscriber(address, newSubscriber)

        expect(context.getSubscribers()[address]).toBe(subscriber)
      })
    })

    describe('removing subscribers', () => {
      it('should remove existing subscriber and clear its events', () => {
        const { context, subscriber, address } = createTestContext()
        const clearSpy = jest.spyOn(subscriber.all, 'clear')

        context.addSubscriber(address, subscriber)
        context.removeSubscriber(address)

        expect(context.getSubscribers()[address]).toBeUndefined()
        expect(clearSpy).toHaveBeenCalled()
      })

      it('should handle removing non-existent subscriber gracefully', () => {
        const { context, address } = createTestContext()

        context.removeSubscriber(address)

        expect(context.getSubscribers()[address]).toBeUndefined()
      })
    })
  })

  describe('subscriber queries', () => {
    it('should return all subscriber addresses', () => {
      const { context } = createTestContext()
      const addresses = ['0x123', '0x456', '0x789']

      addresses.forEach((address) => context.addSubscriber(address, mitt()))

      expect(context.getSubscribersAddresses()).toEqual(addresses)
    })

    describe('getOrAddSubscriber', () => {
      it('should return existing subscriber', () => {
        const { context, subscriber, address } = createTestContext()

        context.addSubscriber(address, subscriber)

        expect(context.getOrAddSubscriber(address)).toBe(subscriber)
      })

      it('should create and return new subscriber if none exists', () => {
        const { context, address } = createTestContext()

        const newSubscriber = context.getOrAddSubscriber(address)

        expect(newSubscriber).toBeDefined()
        expect(newSubscriber.all).toBeDefined()
      })
    })
  })
})
