import { test } from '../components'
import { createTestIdentity, Identity } from './utils/auth'
import { connectAuthenticatedRpcClient } from './utils/rpc-client'
import { connectStreamClient, StreamClient } from './utils/stream-client'
import { createMockProfile } from '../mocks/profile'
import {
  createParityFixtures,
  normalizeRpc,
  STREAM_METHODS,
  RpcUpdate,
  ParityFixture,
  ACTOR
} from '../fixtures/stream-parity'
import {
  BLOCK_UPDATES_CHANNEL,
  FRIENDSHIP_UPDATES_CHANNEL,
  PRIVATE_VOICE_CHAT_UPDATES_CHANNEL
} from '../../src/adapters/pubsub'
import { Action } from '../../src/types'
import { VoiceChatStatus } from '../../src/logic/voice/types'

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Subscription state did not settle')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function nextEvent(iterator: AsyncIterator<RpcUpdate>): Promise<RpcUpdate> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Missing RPC event')), 5000)
      })
    ])
    if (result.done) throw new Error('RPC subscription ended unexpectedly')
    return result.value
  } finally {
    clearTimeout(timeout)
  }
}

test('RPC / JSON stream contract parity', ({ components, stubComponents }) => {
  let identity: Identity
  let address: string
  let rpc: Awaited<ReturnType<typeof connectAuthenticatedRpcClient>>
  let json: StreamClient
  let outsiderRpc: Awaited<ReturnType<typeof connectAuthenticatedRpcClient>>
  let outsiderJson: StreamClient
  let outsiderAddress: string

  beforeEach(async () => {
    identity = await createTestIdentity()
    address = identity.realAccount.address.toLowerCase()
    const outsider = await createTestIdentity()
    outsiderAddress = outsider.realAccount.address.toLowerCase()
    stubComponents.registry.getProfile.mockImplementation(async (userAddress) => createMockProfile(userAddress))
    stubComponents.registry.getProfiles.mockResolvedValue([])
    rpc = await connectAuthenticatedRpcClient(components, identity)
    json = await connectStreamClient(components, identity)
    outsiderRpc = await connectAuthenticatedRpcClient(components, outsider)
    outsiderJson = await connectStreamClient(components, outsider)
  })

  afterEach(async () => {
    rpc?.close()
    json?.close()
    outsiderRpc?.close()
    outsiderJson?.close()
    await waitUntil(
      () =>
        !components.subscribersContext.getSubscriber(address) &&
        !components.subscribersContext.getSubscriber(outsiderAddress)
    )
  })

  describe.each(createParityFixtures())('when serializing $name over both sockets', (template) => {
    let fixture: ParityFixture
    let rpcNext: Promise<RpcUpdate>
    let outsiderReceived: boolean

    beforeEach(async () => {
      fixture = createParityFixtures(address).find((candidate) => candidate.name === template.name)!
      outsiderReceived = false
      rpcNext = nextEvent(rpc.client[STREAM_METHODS[fixture.stream]]({}))
      void outsiderRpc.client[STREAM_METHODS[fixture.stream]]({})
        .next()
        .then(
          (result) => {
            outsiderReceived = !result.done
          },
          () => undefined
        )
      json.send({ type: 'subscribe', id: 'parity', stream: fixture.stream })
      outsiderJson.send({ type: 'subscribe', id: 'parity', stream: fixture.stream })
      await Promise.all([
        json.waitFor((message) => message.type === 'subscribed'),
        outsiderJson.waitFor((message) => message.type === 'subscribed')
      ])
      await waitUntil(
        () =>
          (components.subscribersContext.getSubscriber(address)?.all.get(fixture.event)?.length ?? 0) === 2 &&
          (components.subscribersContext.getSubscriber(outsiderAddress)?.all.get(fixture.event)?.length ?? 0) === 2
      )
      // Inject at the shared per-user event boundary: this tests real protobuf and JSON wire encoding.
      // Recipient selection through pubsub is checked separately below.
      components.subscribersContext.getSubscriber(address)?.emit(fixture.event, fixture.update)
    })

    it('should deliver equivalent wire payloads only on the selected user connections', async () => {
      expect((await json.waitFor((message) => message.type === 'event')).data).toEqual(
        normalizeRpc(fixture.stream, await rpcNext)
      )
      expect(await outsiderJson.collect((message) => message.type === 'event', 100)).toEqual([])
      expect(outsiderReceived).toBe(false)
    })
  })

  describe.each(['block_updates', 'friendship_updates', 'private_voice_chat_updates'] as const)(
    'when routing a targeted %s event through pubsub',
    (stream) => {
      let rpcNext: Promise<RpcUpdate>
      let outsiderReceived: boolean
      let channel: string
      let payload: object

      beforeEach(async () => {
        outsiderReceived = false
        rpcNext = nextEvent(rpc.client[STREAM_METHODS[stream]]({}))
        void outsiderRpc.client[STREAM_METHODS[stream]]({})
          .next()
          .then(
            (result) => {
              outsiderReceived = !result.done
            },
            () => undefined
          )
        json.send({ type: 'subscribe', id: 'target', stream })
        outsiderJson.send({ type: 'subscribe', id: 'target', stream })
        await Promise.all([
          json.waitFor((message) => message.type === 'subscribed'),
          outsiderJson.waitFor((message) => message.type === 'subscribed')
        ])
        const event = createParityFixtures().find((fixture) => fixture.stream === stream)!.event
        await waitUntil(
          () =>
            (components.subscribersContext.getSubscriber(address)?.all.get(event)?.length ?? 0) === 2 &&
            (components.subscribersContext.getSubscriber(outsiderAddress)?.all.get(event)?.length ?? 0) === 2
        )
        if (stream === 'block_updates') {
          channel = BLOCK_UPDATES_CHANNEL
          payload = { blockerAddress: ACTOR, blockedAddress: address, isBlocked: true }
        } else if (stream === 'friendship_updates') {
          channel = FRIENDSHIP_UPDATES_CHANNEL
          payload = { id: 'parity-request', from: ACTOR, to: address, action: Action.REQUEST, timestamp: 1700000000000 }
        } else {
          channel = PRIVATE_VOICE_CHAT_UPDATES_CHANNEL
          // Accepted credentials must only reach the caller, never another connected user.
          payload = {
            callId: 'parity-call',
            callerAddress: address,
            calleeAddress: ACTOR,
            status: VoiceChatStatus.ACCEPTED,
            credentials: { connectionUrl: 'livekit:wss://example?token=private' }
          }
        }
        await components.pubsub.publishInChannel(channel, payload)
      })

      it('should apply the same recipient rules to both transports', async () => {
        expect((await json.waitFor((message) => message.type === 'event')).data).toEqual(
          normalizeRpc(stream, await rpcNext)
        )
        expect(await outsiderJson.collect((message) => message.type === 'event', 100)).toEqual([])
        expect(outsiderReceived).toBe(false)
      })
    }
  )
  describe.each(Object.values(STREAM_METHODS))('when unsubscribing and disconnecting %s', (method) => {
    let fixture: ParityFixture
    let rpcStream: AsyncIterator<RpcUpdate>

    beforeEach(async () => {
      const match = createParityFixtures(address).find((candidate) => STREAM_METHODS[candidate.stream] === method)
      if (!match) throw new Error('Missing lifecycle fixture')
      fixture = match
      rpcStream = rpc.client[method]({})
      json.send({ type: 'subscribe', id: 'lifecycle', stream: fixture.stream })
      await json.waitFor((message) => message.type === 'subscribed')
    })

    it('should stop JSON delivery after unsubscribe and preserve RPC through JSON disconnect', async () => {
      const firstRpc = nextEvent(rpcStream)
      await waitUntil(
        () => (components.subscribersContext.getSubscriber(address)?.all.get(fixture.event)?.length ?? 0) === 2
      )
      components.subscribersContext.getSubscriber(address)?.emit(fixture.event, fixture.update)
      expect((await json.waitFor((message) => message.type === 'event')).data).toEqual(
        normalizeRpc(fixture.stream, await firstRpc)
      )

      json.send({ type: 'unsubscribe', id: 'lifecycle' })
      await json.waitFor((message) => message.type === 'end')
      await waitUntil(
        () => (components.subscribersContext.getSubscriber(address)?.all.get(fixture.event)?.length ?? 0) === 1
      )
      const secondRpc = nextEvent(rpcStream)
      components.subscribersContext.getSubscriber(address)?.emit(fixture.event, fixture.update)
      await secondRpc
      expect(await json.collect((message) => message.type === 'event', 100)).toEqual([])

      json.close()
      await json.closed
      const thirdRpc = nextEvent(rpcStream)
      components.subscribersContext.getSubscriber(address)?.emit(fixture.event, fixture.update)
      await expect(thirdRpc).resolves.toBeDefined()

      json = await connectStreamClient(components, identity)
      json.send({ type: 'subscribe', id: 'survivor', stream: fixture.stream })
      await json.waitFor((message) => message.type === 'subscribed')
      await waitUntil(
        () => (components.subscribersContext.getSubscriber(address)?.all.get(fixture.event)?.length ?? 0) === 2
      )
      rpc.close()
      await waitUntil(
        () => (components.subscribersContext.getSubscriber(address)?.all.get(fixture.event)?.length ?? 0) === 1
      )
      components.subscribersContext.getSubscriber(address)?.emit(fixture.event, fixture.update)
      await expect(json.waitFor((message) => message.type === 'event')).resolves.toMatchObject({
        stream: fixture.stream
      })
    })
  })
})
