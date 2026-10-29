import { createWsPoolComponent, WsAdmissionError, IWsPoolComponent } from '../../../src/logic/ws-pool'
import { createLogsMockedComponent, createMockConfigComponent, mockMetrics } from '../../mocks/components'
import { WsUserData } from '../../../src/types'

function createPool(values: Record<string, number | undefined>): Promise<IWsPoolComponent> {
  return createWsPoolComponent({
    logs: createLogsMockedComponent(),
    metrics: mockMetrics,
    config: createMockConfigComponent({ getNumber: jest.fn(async (key: string) => values[key]) })
  })
}

describe('when admitting sockets and subscriptions by address', () => {
  let pool: IWsPoolComponent
  let now: number
  let data: WsUserData

  beforeEach(async () => {
    now = 0
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    data = { auth: false, authenticating: false, isConnected: true, wsConnectionId: 'one', connectionStartTime: 0 }
    pool = await createPool({
      WS_MAX_CONNECTIONS_PER_ADDRESS: 2,
      WS_SUBSCRIPTIONS_PER_SECOND: 1,
      WS_SUBSCRIPTION_BURST: 2,
      WS_ADDRESS_BUDGET_CAPACITY: 2
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  describe('and multiple protocols share an address', () => {
    beforeEach(() => {
      pool.claimAddress('0xAbC', 'one')
      pool.claimAddress('0xabc', 'two')
    })

    it('should cap connections regardless of address casing or protocol', () => {
      expect(() => pool.claimAddress('0xABC', 'three')).toThrow(WsAdmissionError)
    })

    describe('and both connections start subscriptions', () => {
      beforeEach(() => {
        pool.admitSubscription('one')
        pool.admitSubscription('two')
      })

      it('should share the subscription budget across connections', () => {
        expect(() => pool.admitSubscription('one')).toThrow('Subscription rate exceeded')
      })
    })

    describe('and one of them disconnects', () => {
      beforeEach(() => {
        pool.unregisterConnection(data)
      })

      it('should release the connection slot', () => {
        expect(() => pool.claimAddress('0xabc', 'three')).not.toThrow()
      })
    })
  })

  describe('and a client reconnects after exhausting its budget', () => {
    beforeEach(() => {
      pool.claimAddress('0xabc', 'one')
      pool.admitSubscription('one')
      pool.admitSubscription('one')
      pool.unregisterConnection(data)
      pool.claimAddress('0xabc', 'reconnected')
    })

    it('should retain the depleted budget across reconnects', () => {
      expect(() => pool.admitSubscription('reconnected')).toThrow(WsAdmissionError)
    })

    describe('and another address connects', () => {
      beforeEach(() => {
        pool.claimAddress('0xdef', 'other')
      })

      it('should give it an independent budget', () => {
        expect(() => pool.admitSubscription('other')).not.toThrow()
      })
    })

    describe('and a second elapses', () => {
      beforeEach(() => {
        now = 1000
        pool.admitSubscription('reconnected')
      })

      it('should replenish exactly one token using elapsed monotonic time', () => {
        expect(() => pool.admitSubscription('reconnected')).toThrow(WsAdmissionError)
      })
    })
  })

  describe('and the bounded address table is full', () => {
    beforeEach(() => {
      pool.claimAddress('0xabc', 'one')
      pool.admitSubscription('one')
      pool.unregisterConnection(data)
      pool.claimAddress('0xdef', 'two')
    })

    it('should reject new addresses instead of evicting a depleted budget', () => {
      expect(() => pool.claimAddress('0x123', 'three')).toThrow('capacity')
    })

    describe('and the inactive budget fully replenishes', () => {
      beforeEach(() => {
        now = 1000
      })

      it('should reclaim it for a new address', () => {
        expect(() => pool.claimAddress('0x123', 'three')).not.toThrow()
      })
    })
  })

  describe('and a stream connection is registered', () => {
    beforeEach(() => {
      pool.registerConnection({ getUserData: () => data } as never, 'stream')
    })

    it('should expose the protocol gauge and retain the aggregate', () => {
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections_by_protocol', { protocol: 'stream' }, 1)
      expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections', {}, 1)
    })

    describe('and it is unregistered', () => {
      beforeEach(() => {
        pool.unregisterConnection(data)
      })

      it('should decrement the protocol gauge', () => {
        expect(mockMetrics.observe).toHaveBeenCalledWith('ws_active_connections_by_protocol', { protocol: 'stream' }, 0)
      })
    })
  })
})

describe('when the address admission configuration is invalid', () => {
  describe.each([
    ['WS_MAX_CONNECTIONS_PER_ADDRESS', 0],
    ['WS_MAX_CONNECTIONS_PER_ADDRESS', 1.5],
    ['WS_SUBSCRIPTION_BURST', -1],
    ['WS_ADDRESS_BUDGET_CAPACITY', 0],
    ['WS_SUBSCRIPTIONS_PER_SECOND', 0],
    ['WS_SUBSCRIPTIONS_PER_SECOND', Number.POSITIVE_INFINITY]
  ])('and %s is %s', (key, value) => {
    let creation: Promise<IWsPoolComponent>

    beforeEach(() => {
      creation = createPool({ [key]: value })
    })

    it('should refuse to create the pool', async () => {
      await expect(creation).rejects.toThrow('Invalid WebSocket address admission configuration')
    })
  })
})
