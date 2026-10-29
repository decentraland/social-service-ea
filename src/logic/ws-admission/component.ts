import { LRUCache } from 'lru-cache'
import { AppComponents, WsProtocol } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { ConnectionClaim, IWsAdmissionComponent } from './types'
import { SubscriptionRateLimitedError } from './errors'

type Budget = { tokens: number; updatedAt: number }
type AddressState = { connections: Map<string, WsProtocol>; budget: Budget }

/**
 * Per-address WebSocket limits shared by the RPC and JSON protocols: a connection cap and a subscription-start
 * token bucket that survives reconnects.
 */
export async function createWsAdmissionComponent(
  components: Pick<AppComponents, 'config' | 'metrics'>
): Promise<IWsAdmissionComponent> {
  const { config, metrics } = components

  const maxPerAddress = (await config.getNumber('WS_MAX_CONNECTIONS_PER_ADDRESS')) ?? 8
  const subscriptionRate = (await config.getNumber('WS_SUBSCRIPTIONS_PER_SECOND')) ?? 2
  const subscriptionBurst = (await config.getNumber('WS_SUBSCRIPTION_BURST')) ?? 24
  const idleBudgetCapacity = (await config.getNumber('WS_ADDRESS_BUDGET_CAPACITY')) ?? 10000
  if (
    ![maxPerAddress, subscriptionBurst, idleBudgetCapacity].every(
      (value) => Number.isSafeInteger(value) && value > 0
    ) ||
    !Number.isFinite(subscriptionRate) ||
    subscriptionRate <= 0
  ) {
    throw new Error('Invalid WebSocket address admission configuration')
  }

  // Connected addresses are bounded by the sockets themselves; only disconnected, partly spent budgets are
  // cached, and losing one to LRU eviction just grants a full budget (fails open).
  const connected = new Map<string, AddressState>()
  const idleBudgets = new LRUCache<string, Budget>({ max: idleBudgetCapacity })
  const addressByConnection = new Map<string, string>()

  function replenish(budget: Budget, now: number): void {
    budget.tokens = Math.min(
      subscriptionBurst,
      budget.tokens + (Math.max(0, now - budget.updatedAt) * subscriptionRate) / 1000
    )
    budget.updatedAt = now
  }

  function claimConnection(address: string, connectionId: string, protocol: WsProtocol): ConnectionClaim {
    if (addressByConnection.has(connectionId)) return {}
    const normalized = normalizeAddress(address)

    let state = connected.get(normalized)
    if (!state) {
      const budget = idleBudgets.get(normalized) ?? { tokens: subscriptionBurst, updatedAt: performance.now() }
      idleBudgets.delete(normalized)
      state = { connections: new Map(), budget }
      connected.set(normalized, state)
    }

    let evictedConnectionId: string | undefined
    if (state.connections.size >= maxPerAddress) {
      // Map iteration follows insertion order, so the first entry is the oldest connection.
      const [oldestId, oldestProtocol] = state.connections.entries().next().value as [string, WsProtocol]
      state.connections.delete(oldestId)
      addressByConnection.delete(oldestId)
      evictedConnectionId = oldestId
      metrics.increment('ws_admission_evictions', { protocol: oldestProtocol })
    }

    state.connections.set(connectionId, protocol)
    addressByConnection.set(connectionId, normalized)
    return { evictedConnectionId }
  }

  function admitSubscription(connectionId: string): void {
    const address = addressByConnection.get(connectionId)
    const state = address === undefined ? undefined : connected.get(address)
    if (!state) throw new Error(`Connection ${connectionId} has no admission claim`)

    replenish(state.budget, performance.now())
    if (state.budget.tokens < 1) {
      metrics.increment('ws_admission_rejections', {
        protocol: state.connections.get(connectionId) ?? 'stream',
        reason: 'subscriptions'
      })
      throw new SubscriptionRateLimitedError()
    }
    state.budget.tokens -= 1
  }

  function releaseConnection(connectionId: string): void {
    const address = addressByConnection.get(connectionId)
    if (address === undefined) return
    addressByConnection.delete(connectionId)

    const state = connected.get(address)
    if (!state) return
    state.connections.delete(connectionId)
    if (state.connections.size > 0) return

    connected.delete(address)
    replenish(state.budget, performance.now())
    if (state.budget.tokens < subscriptionBurst) idleBudgets.set(address, state.budget)
  }

  return { claimConnection, admitSubscription, releaseConnection }
}
