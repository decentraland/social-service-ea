import { createSubscribersContext } from '../../../src/adapters/rpc-server/subscribers-context'
import mitt from 'mitt'
import { SubscriptionEventsEmitter } from '../../../src/types'

describe('SubscribersContext', () => {
  describe('createSubscribersContext', () => {
    it('should create an RPC context with empty subscribers', () => {
      const context = createSubscribersContext()
      expect(context.getSubscribers()).toEqual({})
    })

    it('should add a subscriber', () => {
      const context = createSubscribersContext()
      const subscriber = mitt<SubscriptionEventsEmitter>()
      const address = '0x123'

      context.addSubscriber(address, subscriber)

      const subscribers = context.getSubscribers()
      expect(subscribers[address]).toBe(subscriber)
    })

    it('should not override existing subscriber', () => {
      const context = createSubscribersContext()
      const subscriber1 = mitt<SubscriptionEventsEmitter>()
      const subscriber2 = mitt<SubscriptionEventsEmitter>()
      const address = '0x123'

      context.addSubscriber(address, subscriber1)
      context.addSubscriber(address, subscriber2)

      const subscribers = context.getSubscribers()
      expect(subscribers[address]).toBe(subscriber1)
    })

    it('should remove a subscriber', () => {
      const context = createSubscribersContext()
      const subscriber = mitt<SubscriptionEventsEmitter>()
      const address = '0x123'

      context.addSubscriber(address, subscriber)
      context.removeSubscriber(address)

      const subscribers = context.getSubscribers()
      expect(subscribers[address]).toBeUndefined()
    })

    it('should handle removing non-existent subscriber', () => {
      const context = createSubscribersContext()
      const address = '0x123'

      context.removeSubscriber(address)

      const subscribers = context.getSubscribers()
      expect(subscribers[address]).toBeUndefined()
    })

    it('should get subscribers addresses', () => {
      const context = createSubscribersContext()
      const addresses = ['0x123', '0x456', '0x789']

      addresses.forEach((address) => {
        context.addSubscriber(address, mitt())
      })

      expect(context.getSubscribersAddresses()).toEqual(addresses)
    })

    it('should get existing subscriber', () => {
      const context = createSubscribersContext()
      const subscriber = mitt<SubscriptionEventsEmitter>()
      const address = '0x123'

      context.addSubscriber(address, subscriber)

      expect(context.getSubscriber(address)).toBe(subscriber)
    })

    it('should return new emitter for non-existent subscriber', () => {
      const context = createSubscribersContext()
      const address = '0x123'

      const subscriber = context.getSubscriber(address)

      expect(subscriber).toBeDefined()
      expect(subscriber.all).toBeDefined()
    })

    it('should clear subscriber events on removal', () => {
      const context = createSubscribersContext()
      const subscriber = mitt<SubscriptionEventsEmitter>()
      const address = '0x123'
      const clearSpy = jest.spyOn(subscriber.all, 'clear')

      context.addSubscriber(address, subscriber)
      context.removeSubscriber(address)

      expect(clearSpy).toHaveBeenCalled()
    })
  })
})
