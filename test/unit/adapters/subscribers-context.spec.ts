import { createSubscribersContext } from '../../../src/adapters/rpc-server/subscribers-context'
import mitt from 'mitt'
import { ICacheComponent, IRedisComponent, SubscriptionEventsEmitter } from '../../../src/types'
import { createRedisMock } from '../../mocks/components/redis'
import { createLogsMockedComponent } from '../../mocks/components/logs'
import { ILoggerComponent } from '@well-known-components/interfaces'

describe('SubscribersContext Component', () => {
  let mockRedis: jest.Mocked<IRedisComponent & ICacheComponent>
  let mockLogs: jest.Mocked<ILoggerComponent>

  beforeEach(() => {
    mockRedis = createRedisMock({})
    mockLogs = createLogsMockedComponent()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function createTestContext() {
    return {
      context: createSubscribersContext({ redis: mockRedis, logs: mockLogs }),
      subscriber: mitt<SubscriptionEventsEmitter>(),
      address: '0x123'
    }
  }

  describe('when initializing', () => {
    it('should initialize with empty subscribers', () => {
      const { context } = createTestContext()

      expect(context.getSubscribers()).toEqual({})
    })
  })

  describe('when managing subscribers', () => {
    describe('and adding a subscriber', () => {
      it('should add a new subscriber locally and to Redis', async () => {
        const { context, subscriber, address } = createTestContext()

        await context.addSubscriber(address, subscriber)

        expect(context.getSubscribers()[address]).toBe(subscriber)
        expect(mockRedis.sAdd).toHaveBeenCalledWith('online_subscribers', address)
      })

      it('should preserve existing subscriber when adding duplicate', async () => {
        const { context, subscriber, address } = createTestContext()
        const newSubscriber = mitt<SubscriptionEventsEmitter>()

        await context.addSubscriber(address, subscriber)
        await context.addSubscriber(address, newSubscriber)

        expect(context.getSubscribers()[address]).toBe(subscriber)
        // Should still attempt to add to Redis (idempotent)
        expect(mockRedis.sAdd).toHaveBeenCalledTimes(2)
      })
    })

    describe('and removing a subscriber', () => {
      it('should remove existing subscriber locally and from Redis', async () => {
        const { context, subscriber, address } = createTestContext()
        const clearSpy = jest.spyOn(subscriber.all, 'clear')

        await context.addSubscriber(address, subscriber)
        await context.removeSubscriber(address)

        expect(context.getSubscribers()[address]).toBeUndefined()
        expect(clearSpy).toHaveBeenCalled()
        expect(mockRedis.sRem).toHaveBeenCalledWith('online_subscribers', address)
      })

      it('should handle removing non-existent subscriber gracefully', async () => {
        const { context, address } = createTestContext()

        await context.removeSubscriber(address)

        expect(context.getSubscribers()[address]).toBeUndefined()
        expect(mockRedis.sRem).toHaveBeenCalledWith('online_subscribers', address)
      })
    })
  })

  describe('when querying subscribers', () => {
    describe('and getting global subscriber addresses', () => {
      it('should return addresses from Redis', async () => {
        const { context } = createTestContext()
        const expectedAddresses = ['0x123', '0x456', '0x789']
        mockRedis.sMembers.mockResolvedValueOnce(expectedAddresses)

        const addresses = await context.getSubscribersAddresses()

        expect(addresses).toEqual(expectedAddresses)
        expect(mockRedis.sMembers).toHaveBeenCalledWith('online_subscribers')
      })

      it('should fallback to local subscribers when Redis fails', async () => {
        const { context, subscriber, address } = createTestContext()
        mockRedis.sMembers.mockRejectedValueOnce(new Error('Redis error'))

        await context.addSubscriber(address, subscriber)
        const addresses = await context.getSubscribersAddresses()

        expect(addresses).toEqual([address])
      })
    })

    describe('and getting local subscriber addresses', () => {
      it('should return only local subscriber addresses', async () => {
        const { context } = createTestContext()
        const addresses = ['0x123', '0x456', '0x789']

        for (const address of addresses) {
          await context.addSubscriber(address, mitt())
        }

        expect(context.getLocalSubscribersAddresses()).toEqual(addresses)
      })
    })

    describe('and using getOrAddSubscriber', () => {
      it('should return existing subscriber', async () => {
        const { context, subscriber, address } = createTestContext()

        await context.addSubscriber(address, subscriber)

        expect(context.getOrAddSubscriber(address)).toBe(subscriber)
      })

      it('should create and return new subscriber if none exists', () => {
        const { context, address } = createTestContext()

        const newSubscriber = context.getOrAddSubscriber(address)

        expect(newSubscriber).toBeDefined()
        expect(newSubscriber.all).toBeDefined()
      })

      it('should add new subscriber to Redis for global tracking', async () => {
        const { context, address } = createTestContext()

        context.getOrAddSubscriber(address)

        // Wait for the async Redis call
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(mockRedis.sAdd).toHaveBeenCalledWith('online_subscribers', address)
      })
    })
  })

  describe('when managing generators', () => {
    it('should register and unregister generators', async () => {
      const { context, subscriber, address } = createTestContext()
      await context.addSubscriber(address, subscriber)

      const mockGenerator = { destroy: jest.fn() }
      context.registerGenerator(address, mockGenerator)
      context.unregisterGenerator(address, mockGenerator)

      // After unregister, removing the subscriber should not call destroy
      await context.removeSubscriber(address)
      expect(mockGenerator.destroy).not.toHaveBeenCalled()
    })

    it('should call destroy on all registered generators when removing a subscriber', async () => {
      const { context, subscriber, address } = createTestContext()
      await context.addSubscriber(address, subscriber)

      const gen1 = { destroy: jest.fn() }
      const gen2 = { destroy: jest.fn() }
      context.registerGenerator(address, gen1)
      context.registerGenerator(address, gen2)

      await context.removeSubscriber(address)

      expect(gen1.destroy).toHaveBeenCalledTimes(1)
      expect(gen2.destroy).toHaveBeenCalledTimes(1)
    })

    it('should call destroy on generators before clearing emitter handlers', async () => {
      const { context, subscriber, address } = createTestContext()
      await context.addSubscriber(address, subscriber)

      const callOrder: string[] = []
      const clearSpy = jest.spyOn(subscriber.all, 'clear').mockImplementation(() => {
        callOrder.push('clear')
      })
      const gen = {
        destroy: jest.fn().mockImplementation(() => {
          callOrder.push('destroy')
        })
      }
      context.registerGenerator(address, gen)

      await context.removeSubscriber(address)

      expect(callOrder).toEqual(['destroy', 'clear'])
      clearSpy.mockRestore()
    })

    it('should handle unregister for non-existent address gracefully', () => {
      const { context } = createTestContext()
      const mockGenerator = { destroy: jest.fn() }
      expect(() => context.unregisterGenerator('0xnonexistent', mockGenerator)).not.toThrow()
    })
  })

  describe('when stopping the component', () => {
    it('should remove all local subscribers from Redis', async () => {
      const { context } = createTestContext()
      const addresses = ['0x123', '0x456']

      for (const address of addresses) {
        await context.addSubscriber(address, mitt())
      }

      await context.stop?.()

      expect(mockRedis.sRem).toHaveBeenCalledWith('online_subscribers', addresses)
      expect(context.getSubscribers()).toEqual({})
    })

    it('should destroy all generators for all subscribers on stop', async () => {
      const { context } = createTestContext()
      const addresses = ['0x123', '0x456']
      const generators: { destroy: jest.Mock }[] = []

      for (const address of addresses) {
        await context.addSubscriber(address, mitt())
        const gen = { destroy: jest.fn() }
        generators.push(gen)
        context.registerGenerator(address, gen)
      }

      await context.stop?.()

      for (const gen of generators) {
        expect(gen.destroy).toHaveBeenCalledTimes(1)
      }
    })
  })
})
