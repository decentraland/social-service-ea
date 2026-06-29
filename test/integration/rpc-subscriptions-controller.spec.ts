import { test } from '../components'
import { createTestIdentity, Identity } from './utils/auth'
import { connectAuthenticatedRpcClient } from './utils/rpc-client'
import { BLOCK_UPDATES_CHANNEL } from '../../src/adapters/pubsub'

// Mirrors SUBSCRIBERS_SET_KEY in src/adapters/rpc-server/subscribers-context.ts.
const ONLINE_SUBSCRIBERS_KEY = 'online_subscribers'
// Generous window for the subscribe RPC round-trip to register the server-side listener
// before we publish, and for fire-and-forget Redis writes / WS close handling to settle.
const SETTLE_MS = 1500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function nextWithTimeout<T>(iterator: AsyncIterator<T>, ms = 5000): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timed out waiting for a stream value')), ms)
  )
  const result = (await Promise.race([iterator.next(), timeout])) as IteratorResult<T>
  if (result.done) {
    throw new Error('Stream ended before yielding a value')
  }
  return result.value
}

// Exercises the end-to-end multi-connection path: a single wallet address connected from two
// independent WebSocket connections (website + client), both subscribing over real @dcl/rpc,
// with fan-out driven through the real Redis pub/sub channel.
test('RPC subscriptions with multiple connections per address', ({ components }) => {
  let identity: Identity
  let address: string
  let clientA: Awaited<ReturnType<typeof connectAuthenticatedRpcClient>>
  let clientB: Awaited<ReturnType<typeof connectAuthenticatedRpcClient>>

  beforeEach(async () => {
    identity = await createTestIdentity()
    address = identity.realAccount.address.toLowerCase()
    clientA = await connectAuthenticatedRpcClient(components, identity)
    clientB = await connectAuthenticatedRpcClient(components, identity)
  })

  afterEach(async () => {
    clientA?.close()
    clientB?.close()
    await sleep(SETTLE_MS)
  })

  describe('when both connections subscribe to block updates', () => {
    it('should deliver a block update to both connections', async () => {
      const streamA = clientA.client.subscribeToBlockUpdates({})
      const streamB = clientB.client.subscribeToBlockUpdates({})

      const nextA = nextWithTimeout(streamA)
      const nextB = nextWithTimeout(streamB)
      await sleep(SETTLE_MS)

      await components.pubsub.publishInChannel(BLOCK_UPDATES_CHANNEL, {
        blockerAddress: '0x1111111111111111111111111111111111111111',
        blockedAddress: address,
        isBlocked: true
      })

      const [updateForA, updateForB] = await Promise.all([nextA, nextB])

      expect(updateForA.isBlocked).toBe(true)
      expect(updateForB.isBlocked).toBe(true)
      expect(updateForA.address.toLowerCase()).toEqual('0x1111111111111111111111111111111111111111')
      expect(updateForB.address.toLowerCase()).toEqual('0x1111111111111111111111111111111111111111')
    })
  })

  describe('when one of the two connections disconnects', () => {
    it('should keep delivering updates to the remaining connection', async () => {
      const streamA = clientA.client.subscribeToBlockUpdates({})
      const streamB = clientB.client.subscribeToBlockUpdates({})

      const firstA = nextWithTimeout(streamA)
      const firstB = nextWithTimeout(streamB)
      await sleep(SETTLE_MS)

      await components.pubsub.publishInChannel(BLOCK_UPDATES_CHANNEL, {
        blockerAddress: '0x2222222222222222222222222222222222222222',
        blockedAddress: address,
        isBlocked: true
      })
      await Promise.all([firstA, firstB])

      // Close one connection; the other must keep working.
      clientA.close()
      await sleep(SETTLE_MS)

      const secondB = nextWithTimeout(streamB)
      await components.pubsub.publishInChannel(BLOCK_UPDATES_CHANNEL, {
        blockerAddress: '0x3333333333333333333333333333333333333333',
        blockedAddress: address,
        isBlocked: false
      })

      const updateForB = await secondB
      expect(updateForB.isBlocked).toBe(false)
      expect(updateForB.address.toLowerCase()).toEqual('0x3333333333333333333333333333333333333333')
    })
  })

  describe('when tracking the address in the Redis online set', () => {
    it('should keep the address online until the last connection closes', async () => {
      await sleep(SETTLE_MS)
      expect(await components.redis.client.sIsMember(ONLINE_SUBSCRIBERS_KEY, address)).toBe(true)

      // One connection left: still online.
      clientA.close()
      await sleep(SETTLE_MS)
      expect(await components.redis.client.sIsMember(ONLINE_SUBSCRIBERS_KEY, address)).toBe(true)

      // Last connection closed: now offline.
      clientB.close()
      await sleep(SETTLE_MS)
      expect(await components.redis.client.sIsMember(ONLINE_SUBSCRIBERS_KEY, address)).toBe(false)
    })
  })
})
