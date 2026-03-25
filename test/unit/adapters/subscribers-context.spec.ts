import { createSubscribersContext } from '../../../src/adapters/rpc-server/subscribers-context'
import mitt from 'mitt'
import { ICacheComponent, IRedisComponent, SubscriptionEventsEmitter } from '../../../src/types'
import { createRedisMock } from '../../mocks/components/redis'
import { createLogsMockedComponent } from '../../mocks/components/logs'
import { createMockConfigComponent } from '../../mocks/components/config'
import { ILoggerComponent, IConfigComponent } from '@well-known-components/interfaces'

describe('SubscribersContext Component', () => {
  let mockRedis: jest.Mocked<IRedisComponent & ICacheComponent>
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockConfig: jest.Mocked<IConfigComponent>

  beforeEach(() => {
    mockRedis = createRedisMock({})
    mockLogs = createLogsMockedComponent()
    mockConfig = createMockConfigComponent({
      getNumber: jest.fn().mockResolvedValue(undefined)
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function createTestContext() {
    return {
      context: createSubscribersContext({ redis: mockRedis, logs: mockLogs, config: mockConfig }),
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
      it('should add a new subscriber locally and to Redis with TTL', async () => {
        const { context, subscriber, address } = createTestContext()

        await context.addSubscriber(address, subscriber)

        expect(context.getSubscribers()[address]).toBe(subscriber)
        expect(mockRedis.put).toHaveBeenCalledWith(`subscriber:${address}`, '1', { EX: 300 })
      })

      it('should preserve existing subscriber when adding duplicate', async () => {
        const { context, subscriber, address } = createTestContext()
        const newSubscriber = mitt<SubscriptionEventsEmitter>()

        await context.addSubscriber(address, subscriber)
        await context.addSubscriber(address, newSubscriber)

        expect(context.getSubscribers()[address]).toBe(subscriber)
        // Should still attempt to add to Redis (idempotent)
        expect(mockRedis.put).toHaveBeenCalledTimes(2)
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
        expect(mockRedis.client.del).toHaveBeenCalledWith(`subscriber:${address}`)
      })

      it('should handle removing non-existent subscriber gracefully', async () => {
        const { context, address } = createTestContext()

        await context.removeSubscriber(address)

        expect(context.getSubscribers()[address]).toBeUndefined()
        expect(mockRedis.client.del).toHaveBeenCalledWith(`subscriber:${address}`)
      })
    })
  })

  describe('when querying subscribers', () => {
    describe('and getting global subscriber addresses', () => {
      it('should return addresses from Redis using SCAN', async () => {
        const { context } = createTestContext()
        const scanKeys = ['subscriber:0x123', 'subscriber:0x456', 'subscriber:0x789']

        // Mock scanIterator as an async generator
        ;(mockRedis.client.scanIterator as jest.Mock).mockReturnValue(
          (async function* () {
            for (const key of scanKeys) {
              yield key
            }
          })()
        )

        const addresses = await context.getSubscribersAddresses()

        expect(addresses).toEqual(['0x123', '0x456', '0x789'])
        expect(mockRedis.client.scanIterator).toHaveBeenCalledWith({
          MATCH: 'subscriber:*',
          COUNT: 200
        })
      })

      it('should fallback to local subscribers when Redis fails', async () => {
        const { context, subscriber, address } = createTestContext()
        ;(mockRedis.client.scanIterator as jest.Mock).mockImplementation(() => {
          throw new Error('Redis error')
        })

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

      it('should add new subscriber key to Redis with TTL', async () => {
        const { context, address } = createTestContext()

        context.getOrAddSubscriber(address)

        // Wait for the async Redis call
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(mockRedis.put).toHaveBeenCalledWith(`subscriber:${address}`, '1', { EX: 300 })
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
    it('should remove all local subscriber keys from Redis', async () => {
      const { context } = createTestContext()
      const addresses = ['0x123', '0x456']

      await context.start?.()

      for (const address of addresses) {
        await context.addSubscriber(address, mitt())
      }

      await context.stop?.()

      expect(mockRedis.client.del).toHaveBeenCalledWith(addresses.map((a) => `subscriber:${a}`))
      expect(context.getSubscribers()).toEqual({})
    })

    it('should destroy all generators for all subscribers on stop', async () => {
      const { context } = createTestContext()
      const addresses = ['0x123', '0x456']
      const generators: { destroy: jest.Mock }[] = []

      await context.start?.()

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

    it('should clear heartbeat interval on stop', async () => {
      const { context } = createTestContext()
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval')

      await context.start?.()
      await context.stop?.()

      expect(clearIntervalSpy).toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
    })
  })
})
