import { createSubscribersContext } from '../../../src/adapters/rpc-server/subscribers-context'
import { createLogsMockedComponent } from '../../mocks/components/logs'
import { mockMetrics } from '../../mocks/components/metrics'
import { mockConfig } from '../../mocks/components/config'
import { createWsPoolMockedComponent } from '../../mocks/components/ws-pool'
import { ILoggerComponent } from '@well-known-components/interfaces'

describe('SubscribersContext Component', () => {
  let mockLogs: jest.Mocked<ILoggerComponent>

  beforeEach(() => {
    mockLogs = createLogsMockedComponent()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function createTestContext() {
    return {
      context: createSubscribersContext(
        { logs: mockLogs, metrics: mockMetrics, config: mockConfig },
        createWsPoolMockedComponent()
      ),
      address: '0x123'
    }
  }

  describe('when initializing', () => {
    it('should initialize with empty subscribers', () => {
      const { context } = createTestContext()

      expect(context.getSubscribers()).toEqual({})
    })
  })

  describe('when adding connections for an address', () => {
    describe('and it is the first connection for the address', () => {
      let context: ReturnType<typeof createTestContext>['context']
      let address: string

      beforeEach(() => {
        ;({ context, address } = createTestContext())
        context.addConnection(address, 'conn-1')
      })

      it('should create the shared emitter for the address', () => {
        expect(context.getSubscriber(address)).toBeDefined()
      })
    })

    describe('and a second connection for the same address is added', () => {
      let context: ReturnType<typeof createTestContext>['context']
      let address: string

      beforeEach(() => {
        ;({ context, address } = createTestContext())
        context.addConnection(address, 'conn-1')
        context.addConnection(address, 'conn-2')
      })

      it('should keep a single shared emitter for the address', () => {
        expect(context.getLocalSubscribersAddresses()).toEqual([address])
      })
    })
  })

  describe('when removing connections for an address', () => {
    describe('and other connections for the address remain', () => {
      let context: ReturnType<typeof createTestContext>['context']
      let address: string
      let wasLast: boolean

      beforeEach(() => {
        ;({ context, address } = createTestContext())
        context.addConnection(address, 'conn-1')
        context.addConnection(address, 'conn-2')
        wasLast = context.removeConnection(address, 'conn-1')
      })

      it('should report that it was not the last connection', () => {
        expect(wasLast).toBe(false)
      })

      it('should keep the shared emitter alive', () => {
        expect(context.getSubscriber(address)).toBeDefined()
      })
    })

    describe('and it is the last connection for the address', () => {
      let context: ReturnType<typeof createTestContext>['context']
      let address: string
      let wasLast: boolean

      beforeEach(() => {
        ;({ context, address } = createTestContext())
        context.addConnection(address, 'conn-1')
        wasLast = context.removeConnection(address, 'conn-1')
      })

      it('should report that it was the last connection', () => {
        expect(wasLast).toBe(true)
      })

      it('should clear the shared emitter', () => {
        expect(context.getSubscriber(address)).toBeUndefined()
      })
    })

    describe('and the connection was already removed', () => {
      let context: ReturnType<typeof createTestContext>['context']
      let address: string
      let wasLast: boolean

      beforeEach(() => {
        ;({ context, address } = createTestContext())
        context.addConnection(address, 'conn-1')
        context.removeConnection(address, 'conn-1')
        wasLast = context.removeConnection(address, 'conn-1')
      })

      it('should report that it was not the last connection (idempotent)', () => {
        expect(wasLast).toBe(false)
      })
    })

    describe('and the connection is not tracked for the address', () => {
      let context: ReturnType<typeof createTestContext>['context']
      let address: string
      let generator: { destroy: jest.Mock }
      let wasLast: boolean

      beforeEach(() => {
        ;({ context, address } = createTestContext())
        // No addConnection for this id, so the connection is not tracked for the address.
        generator = { destroy: jest.fn() }
        context.registerGenerator('untracked-conn', generator)
        wasLast = context.removeConnection(address, 'untracked-conn')
      })

      it('should report that it was not the last connection', () => {
        expect(wasLast).toBe(false)
      })

      it('should not tear down generators for a connection it is not tracking', () => {
        expect(generator.destroy).not.toHaveBeenCalled()
      })
    })
  })

  describe('when querying subscribers', () => {
    describe('and getting local subscriber addresses', () => {
      it('should return only local subscriber addresses', () => {
        const { context } = createTestContext()
        const addresses = ['0x123', '0x456', '0x789']

        addresses.forEach((address, index) => context.addConnection(address, `conn-${index}`))

        expect(context.getLocalSubscribersAddresses()).toEqual(addresses)
      })
    })

  })

  describe('when managing generators per connection', () => {
    it('should destroy a connection generators when that connection is removed', () => {
      const { context, address } = createTestContext()
      context.addConnection(address, 'conn-1')

      const generator = { destroy: jest.fn() }
      context.registerGenerator('conn-1', generator)

      context.removeConnection(address, 'conn-1')

      expect(generator.destroy).toHaveBeenCalledTimes(1)
    })

    it('should only destroy the removed connection generators, not other connections for the same address', () => {
      const { context, address } = createTestContext()
      context.addConnection(address, 'conn-1')
      context.addConnection(address, 'conn-2')

      const generatorForConnection1 = { destroy: jest.fn() }
      const generatorForConnection2 = { destroy: jest.fn() }
      context.registerGenerator('conn-1', generatorForConnection1)
      context.registerGenerator('conn-2', generatorForConnection2)

      context.removeConnection(address, 'conn-1')

      expect(generatorForConnection1.destroy).toHaveBeenCalledTimes(1)
      expect(generatorForConnection2.destroy).not.toHaveBeenCalled()
    })

    it('should not destroy a generator that was unregistered before the connection was removed', () => {
      const { context, address } = createTestContext()
      context.addConnection(address, 'conn-1')

      const generator = { destroy: jest.fn() }
      context.registerGenerator('conn-1', generator)
      context.unregisterGenerator('conn-1', generator)

      context.removeConnection(address, 'conn-1')

      expect(generator.destroy).not.toHaveBeenCalled()
    })

    it('should destroy generators before clearing the emitter handlers on the last connection', () => {
      const { context, address } = createTestContext()
      context.addConnection(address, 'conn-1')

      const callOrder: string[] = []
      const emitter = context.getSubscriber(address)!
      const clearSpy = jest.spyOn(emitter.all, 'clear').mockImplementation(() => {
        callOrder.push('clear')
      })
      const generator = {
        destroy: jest.fn().mockImplementation(() => {
          callOrder.push('destroy')
        })
      }
      context.registerGenerator('conn-1', generator)

      context.removeConnection(address, 'conn-1')

      expect(callOrder).toEqual(['destroy', 'clear'])
      clearSpy.mockRestore()
    })

    it('should handle unregister for an unknown connection gracefully', () => {
      const { context } = createTestContext()
      const generator = { destroy: jest.fn() }

      expect(() => context.unregisterGenerator('conn-unknown', generator)).not.toThrow()
    })
  })

  describe('when tracking active subscriptions per connection', () => {
    it('should report no active subscription initially', () => {
      const { context } = createTestContext()

      expect(context.hasActiveSubscription('conn-1', 'friendshipUpdate')).toBe(false)
    })

    it('should report an active subscription after it is set', () => {
      const { context } = createTestContext()

      context.setActiveSubscription('conn-1', 'friendshipUpdate')

      expect(context.hasActiveSubscription('conn-1', 'friendshipUpdate')).toBe(true)
    })

    it('should report no active subscription after it is cleared', () => {
      const { context } = createTestContext()
      context.setActiveSubscription('conn-1', 'friendshipUpdate')

      context.clearActiveSubscription('conn-1', 'friendshipUpdate')

      expect(context.hasActiveSubscription('conn-1', 'friendshipUpdate')).toBe(false)
    })

    it('should track active subscriptions independently per connection', () => {
      const { context } = createTestContext()

      context.setActiveSubscription('conn-1', 'friendshipUpdate')

      expect(context.hasActiveSubscription('conn-2', 'friendshipUpdate')).toBe(false)
    })
  })

  describe('when stopping the component', () => {
    it('should clear all local subscribers', async () => {
      const { context } = createTestContext()
      const addresses = ['0x123', '0x456']

      addresses.forEach((address, index) => context.addConnection(address, `conn-${index}`))

      await context.stop?.()

      expect(context.getSubscribers()).toEqual({})
    })

    it('should destroy all generators for all connections on stop', async () => {
      const { context } = createTestContext()
      const addresses = ['0x123', '0x456']
      const generators: { destroy: jest.Mock }[] = []

      addresses.forEach((address, index) => {
        context.addConnection(address, `conn-${index}`)
        const generator = { destroy: jest.fn() }
        generators.push(generator)
        context.registerGenerator(`conn-${index}`, generator)
      })

      await context.stop?.()

      for (const generator of generators) {
        expect(generator.destroy).toHaveBeenCalledTimes(1)
      }
    })
  })
})
