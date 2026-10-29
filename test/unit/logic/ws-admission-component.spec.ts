import {
  createWsAdmissionComponent,
  IWsAdmissionComponent,
  SubscriptionRateLimitedError
} from '../../../src/logic/ws-admission'
import { createMockConfigComponent, mockMetrics } from '../../mocks/components'

function createAdmission(values: Record<string, number | undefined>): Promise<IWsAdmissionComponent> {
  return createWsAdmissionComponent({
    metrics: mockMetrics,
    config: createMockConfigComponent({ getNumber: jest.fn(async (key: string) => values[key]) })
  })
}

describe('when admitting WebSocket connections and subscriptions by address', () => {
  let admission: IWsAdmissionComponent
  let now: number

  beforeEach(async () => {
    now = 0
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    admission = await createAdmission({
      WS_MAX_CONNECTIONS_PER_ADDRESS: 2,
      WS_SUBSCRIPTIONS_PER_SECOND: 1,
      WS_SUBSCRIPTION_BURST: 2,
      WS_ADDRESS_BUDGET_CAPACITY: 1
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  describe('and an address opens more connections than its cap across protocols', () => {
    let claim: ReturnType<IWsAdmissionComponent['claimConnection']>

    beforeEach(() => {
      admission.claimConnection('0xAbC', 'one', 'rpc')
      admission.claimConnection('0xabc', 'two', 'stream')
      claim = admission.claimConnection('0xABC', 'three', 'stream')
    })

    it('should admit the new connection and displace the oldest one', () => {
      expect(claim).toEqual({ evictedConnectionId: 'one' })
    })

    it('should count the eviction by the protocol of the displaced connection', () => {
      expect(mockMetrics.increment).toHaveBeenCalledWith('ws_admission_evictions', { protocol: 'rpc' })
    })

    describe('and the displaced connection is released afterwards', () => {
      beforeEach(() => {
        admission.releaseConnection('one')
        claim = admission.claimConnection('0xabc', 'four', 'rpc')
      })

      it('should not free a second slot for it', () => {
        expect(claim).toEqual({ evictedConnectionId: 'two' })
      })
    })
  })

  describe('and an address stays within its cap', () => {
    let claim: ReturnType<IWsAdmissionComponent['claimConnection']>

    beforeEach(() => {
      admission.claimConnection('0xabc', 'one', 'rpc')
      claim = admission.claimConnection('0xabc', 'two', 'stream')
    })

    it('should displace nothing', () => {
      expect(claim).toEqual({ evictedConnectionId: undefined })
    })
  })

  describe('and two connections of an address start subscriptions', () => {
    beforeEach(() => {
      admission.claimConnection('0xabc', 'one', 'stream')
      admission.claimConnection('0xabc', 'two', 'stream')
      admission.admitSubscription('one')
      admission.admitSubscription('two')
    })

    describe('and a third subscription starts', () => {
      let error: unknown

      beforeEach(() => {
        try {
          admission.admitSubscription('one')
        } catch (caught) {
          error = caught
        }
      })

      it('should reject it because both starts share one budget', () => {
        expect(error).toBeInstanceOf(SubscriptionRateLimitedError)
      })

      it('should count the rejection', () => {
        expect(mockMetrics.increment).toHaveBeenCalledWith('ws_admission_rejections', {
          protocol: 'stream',
          reason: 'subscriptions'
        })
      })
    })
  })

  describe('and a client reconnects after exhausting its budget', () => {
    beforeEach(() => {
      admission.claimConnection('0xabc', 'one', 'stream')
      admission.admitSubscription('one')
      admission.admitSubscription('one')
      admission.releaseConnection('one')
      admission.claimConnection('0xabc', 'reconnected', 'stream')
    })

    it('should keep the depleted budget', () => {
      expect(() => admission.admitSubscription('reconnected')).toThrow(SubscriptionRateLimitedError)
    })

    describe('and a second elapses', () => {
      beforeEach(() => {
        now = 1000
        admission.admitSubscription('reconnected')
      })

      it('should replenish exactly one token', () => {
        expect(() => admission.admitSubscription('reconnected')).toThrow(SubscriptionRateLimitedError)
      })
    })
  })

  describe('and more disconnected budgets exist than the idle capacity', () => {
    beforeEach(() => {
      admission.claimConnection('0xabc', 'one', 'stream')
      admission.admitSubscription('one')
      admission.admitSubscription('one')
      admission.releaseConnection('one')
      admission.claimConnection('0xdef', 'two', 'stream')
      admission.admitSubscription('two')
      admission.releaseConnection('two')
      admission.claimConnection('0xabc', 'three', 'stream')
    })

    it('should fail open with a full budget for the evicted address', () => {
      expect(() => admission.admitSubscription('three')).not.toThrow()
    })
  })

  describe('and many distinct addresses are connected at once', () => {
    let claims: Array<ReturnType<IWsAdmissionComponent['claimConnection']>>

    beforeEach(() => {
      claims = Array.from({ length: 5 }, (_, index) =>
        admission.claimConnection(`0x${index}`, `connection-${index}`, 'rpc')
      )
    })

    it('should admit all of them regardless of the idle budget capacity', () => {
      expect(claims.every((claim) => claim.evictedConnectionId === undefined)).toBe(true)
    })
  })

  describe('and a connection without a claim starts a subscription', () => {
    it('should fail as a programming error instead of a rate limit', () => {
      expect(() => admission.admitSubscription('unknown')).toThrow('has no admission claim')
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
    let creation: Promise<IWsAdmissionComponent>

    beforeEach(() => {
      creation = createAdmission({ [key]: value })
    })

    it('should refuse to create the component', async () => {
      await expect(creation).rejects.toThrow('Invalid WebSocket address admission configuration')
    })
  })
})
