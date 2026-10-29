import { test } from '../components'
import { createMockProfile } from '../mocks/profile'
import { BLOCK_UPDATES_CHANNEL, PRIVATE_VOICE_CHAT_UPDATES_CHANNEL } from '../../src/adapters/pubsub'
import { Action } from '../../src/types'
import { VoiceChatStatus } from '../../src/logic/voice/types'
import { createAuthHeaders, createTestIdentity, Identity } from './utils/auth'
import { connectAuthenticatedRpcClient } from './utils/rpc-client'
import { connectStreamClient, StreamClient, upgradeStatus } from './utils/stream-client'
import { STREAM_WS_PATH } from '../../src/adapters/stream-sessions/constants'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const BLOCKER = '0x1111111111111111111111111111111111111111'

async function nextWithTimeout<T>(iterator: AsyncIterator<T>, ms = 5000): Promise<T> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timed out')), ms))
  const result = (await Promise.race([iterator.next(), timeout])) as IteratorResult<T>
  if (result.done) throw new Error('Stream ended before yielding a value')
  return result.value
}

test('Stream WebSocket Controller (/v1/stream)', function ({ components, stubComponents }) {
  let identity: Identity
  let address: string
  const clients: StreamClient[] = []
  const closers: Array<() => void> = []

  const open = async (withIdentity: Identity | null = identity) => {
    const client = await connectStreamClient(components, withIdentity)
    clients.push(client)
    return client
  }

  const publishBlock = (blockedAddress: string, isBlocked = true) =>
    components.pubsub.publishInChannel(BLOCK_UPDATES_CHANNEL, {
      blockerAddress: BLOCKER,
      blockedAddress,
      isBlocked
    })

  beforeEach(async () => {
    identity = await createTestIdentity()
    address = identity.realAccount.address.toLowerCase()
  })

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.close())
    closers.splice(0).forEach((close) => close())
    await sleep(300)
  })

  describe('when a client authenticates with headers on the upgrade request', () => {
    let client: StreamClient

    beforeEach(async () => {
      client = await connectStreamClient(components, identity, { handshake: 'upgrade_headers' })
      clients.push(client)
      client.send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
      await client.waitFor((message) => message.type === 'subscribed')
      await sleep(500)
      await publishBlock(address)
    })

    it('should be ready without an auth frame and receive its updates', async () => {
      const event = await client.waitFor((message) => message.type === 'event')
      expect(event).toMatchObject({ id: 'blocks', data: { address: BLOCKER, isBlocked: true } })
    })
  })

  describe('when the upgrade request carries an auth chain signed for another path', () => {
    let status: number

    beforeEach(async () => {
      status = await upgradeStatus(components, createAuthHeaders('get', '/', {}, identity))
    })

    it('should refuse the upgrade with 401', () => {
      expect(status).toBe(401)
    })
  })

  describe('when an address opens more sockets than its connection cap', () => {
    let first: StreamClient
    let latest: StreamClient

    beforeEach(async () => {
      first = await open()
      for (let index = 0; index < 7; index++) await open()
      latest = await open()
    })

    it('should close the oldest socket as replaced', async () => {
      await expect(first.closed).resolves.toEqual({ code: 3005, reason: 'Replaced by a newer connection' })
    })

    it('should keep serving the newest socket', async () => {
      latest.send({ type: 'ping' })
      await expect(latest.waitFor((message) => message.type === 'pong')).resolves.toBeDefined()
    })
  })

  describe('when a subscribed connection overflows its event queue', () => {
    let client: StreamClient

    beforeEach(async () => {
      client = await open()
      client.send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
      await client.waitFor((message) => message.type === 'subscribed')
      for (let index = 0; index < 1002; index++) {
        components.subscribersContext.getSubscriber(address)?.emit('blockUpdate', {
          blockerAddress: BLOCKER,
          blockedAddress: address,
          isBlocked: true
        })
      }
    })

    it('should require a resync and release the connection', async () => {
      await expect(client.closed).resolves.toEqual({
        code: 1008,
        reason: 'Subscription overflow; reconnect and resync'
      })
      await sleep(100)
      expect(components.subscribersContext.getLocalSubscribersAddresses()).not.toContain(address)
    })
  })

  describe('when a client floods incoming messages', () => {
    let client: StreamClient
    let healthyClient: StreamClient

    beforeEach(async () => {
      client = await open()
      healthyClient = await open()
      for (let index = 0; index < 100; index++) client.send({ type: 'ping' })
    })

    it('should close only the offending connection', async () => {
      await expect(client.closed).resolves.toEqual({
        code: 1008,
        reason: 'Message rate exceeded; reconnect with backoff'
      })
      healthyClient.send({ type: 'ping' })
      await expect(healthyClient.waitFor((message) => message.type === 'pong')).resolves.toMatchObject({ type: 'pong' })
    })
  })

  describe('when authenticating', () => {
    describe('and the first frame is a valid signed auth chain', () => {
      it('should answer ready and register the address for fan-out', async () => {
        const client = await open()

        expect(client.received.map((message) => message.type)).toContain('ready')
        expect(components.subscribersContext.getLocalSubscribersAddresses()).toContain(address)
      })
    })

    describe.each([
      ['a frame that is not JSON', 'definitely not json'],
      ['a JSON array', '[]'],
      ['an empty object', '{}'],
      [
        'a subscribe message instead of the auth chain',
        JSON.stringify({ type: 'subscribe', id: '1', stream: 'block_updates' })
      ],
      ['auth headers with non-string values', JSON.stringify({ 'x-identity-timestamp': 12345 })]
    ])('and the first frame is %s', (_description, frame) => {
      it('should close the socket with the unauthorized code', async () => {
        const client = await open(null)
        client.sendRaw(frame)

        const { code } = await client.closed
        expect(code).toBe(3003)
      })
    })

    describe('and the signature was made for a different path or method', () => {
      it('should close the socket with the unauthorized code', async () => {
        const client = await open(null)
        client.send(createAuthHeaders('post', '/somewhere-else', {}, identity))

        const { code } = await client.closed
        expect(code).toBe(3003)
      })
    })

    describe('and the chain was signed for the RPC socket path', () => {
      it('should close the socket with the unauthorized code', async () => {
        const client = await open(null)
        client.send(createAuthHeaders('get', '/', {}, identity))

        const { code } = await client.closed
        expect(code).toBe(3003)
      })
    })

    describe('and the chain declares the scene signer', () => {
      it('should close the socket with the unauthorized code', async () => {
        const client = await open(null)
        client.send(createAuthHeaders('get', STREAM_WS_PATH, { signer: 'decentraland-kernel-scene' }, identity))

        const { code } = await client.closed
        expect(code).toBe(3003)
      })
    })

    describe('and a second frame arrives while the first one is still being verified', () => {
      it('should not break the connection', async () => {
        const client = await open(null)
        client.send(createAuthHeaders('get', STREAM_WS_PATH, {}, identity))
        client.send({ type: 'ping' })

        await client.waitFor((message) => message.type === 'ready')
        client.send({ type: 'ping' })
        await client.waitFor((message) => message.type === 'pong')
      })
    })
  })

  describe('when sending invalid protocol messages', () => {
    let client: StreamClient

    beforeEach(async () => {
      client = await open()
    })

    it('should answer ping with pong', async () => {
      client.send({ type: 'ping' })

      await client.waitFor((message) => message.type === 'pong')
    })

    it.each([
      ['non JSON text', 'nope'],
      ['a JSON array', '[1,2]'],
      ['a JSON string', '"hello"'],
      ['null', 'null']
    ])('should answer %s with an invalid_message error and keep the socket open', async (_description, raw) => {
      client.sendRaw(raw)

      const error = await client.waitFor((message) => message.type === 'error')
      expect(error.code).toBe('invalid_message')
      client.send({ type: 'ping' })
      await client.waitFor((message) => message.type === 'pong')
    })

    it('should answer an unknown message type with an invalid_message error', async () => {
      client.send({ type: 'explode' })

      const error = await client.waitFor((message) => message.type === 'error')
      expect(error.code).toBe('invalid_message')
    })

    it('should answer binary garbage with an invalid_message error', async () => {
      client.socket.send(Buffer.from([0xff, 0xfe, 0x00, 0x01]))

      const error = await client.waitFor((message) => message.type === 'error')
      expect(error.code).toBe('invalid_message')
    })

    it.each([
      ['a missing id', { type: 'subscribe', stream: 'block_updates' }],
      ['an empty id', { type: 'subscribe', id: '', stream: 'block_updates' }],
      ['a numeric id', { type: 'subscribe', id: 7, stream: 'block_updates' }],
      ['an id that is too long', { type: 'subscribe', id: 'x'.repeat(65), stream: 'block_updates' }]
    ])('should reject a subscribe with %s', async (_description, message) => {
      client.send(message)

      const error = await client.waitFor((received) => received.type === 'error')
      expect(error.code).toBe('invalid_message')
    })

    it.each(['nope', '', '__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
      'should reject a subscribe to the unknown stream "%s"',
      async (stream) => {
        client.send({ type: 'subscribe', id: 'a', stream })

        const error = await client.waitFor((message) => message.type === 'error')
        expect(error).toMatchObject({ code: 'unknown_stream', id: 'a' })
        expect(client.received.some((message) => message.type === 'subscribed')).toBe(false)
      }
    )

    it('should reject an unsubscribe of an unknown subscription', async () => {
      client.send({ type: 'unsubscribe', id: 'ghost' })

      const error = await client.waitFor((message) => message.type === 'error')
      expect(error).toMatchObject({ code: 'unknown_subscription', id: 'ghost' })
    })

    it('should reject a second subscription to the same stream on one connection', async () => {
      client.send({ type: 'subscribe', id: 'one', stream: 'block_updates' })
      await client.waitFor((message) => message.type === 'subscribed' && message.id === 'one')

      client.send({ type: 'subscribe', id: 'two', stream: 'block_updates' })

      const error = await client.waitFor((message) => message.type === 'error')
      expect(error).toMatchObject({ code: 'duplicate_subscription', id: 'two' })
    })

    it('should reject reusing a subscription id for another stream', async () => {
      client.send({ type: 'subscribe', id: 'one', stream: 'block_updates' })
      await client.waitFor((message) => message.type === 'subscribed')

      client.send({ type: 'subscribe', id: 'one', stream: 'friendship_updates' })

      const error = await client.waitFor((message) => message.type === 'error')
      expect(error.code).toBe('duplicate_subscription')
    })

    it('should close a socket that sends a frame over the payload limit', async () => {
      client.sendRaw(JSON.stringify({ type: 'ping', padding: 'x'.repeat(2 * 1024 * 1024) }))

      const { code } = await client.closed
      expect(code).not.toBe(1000)
    })
  })

  describe('when subscribing', () => {
    it.each([
      'friendship_updates',
      'friend_connectivity_updates',
      'block_updates',
      'private_voice_chat_updates',
      'community_member_connectivity_updates',
      'community_voice_chat_updates'
    ])('should acknowledge a subscription to %s', async (stream) => {
      const client = await open()

      client.send({ type: 'subscribe', id: 'sub-1', stream })

      await client.waitFor((message) => message.type === 'subscribed' && message.id === 'sub-1')
    })

    it('should allow subscribing to all the streams on the same connection', async () => {
      const client = await open()
      const streams = [
        'friendship_updates',
        'friend_connectivity_updates',
        'block_updates',
        'private_voice_chat_updates',
        'community_member_connectivity_updates',
        'community_voice_chat_updates'
      ]

      streams.forEach((stream, index) => client.send({ type: 'subscribe', id: `s${index}`, stream }))

      for (let index = 0; index < streams.length; index++) {
        await client.waitFor((message) => message.type === 'subscribed' && message.id === `s${index}`)
      }
    })
  })

  describe('when a block update is published', () => {
    describe('and the connection is subscribed to block updates', () => {
      it('should deliver who blocked the user, the same update the RPC stream delivers', async () => {
        const rpc = await connectAuthenticatedRpcClient(components, identity)
        closers.push(rpc.close)
        const client = await open()

        const rpcStream = rpc.client.subscribeToBlockUpdates({})
        const rpcNext = nextWithTimeout(rpcStream)
        client.send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
        await client.waitFor((message) => message.type === 'subscribed')
        await sleep(1000)

        await publishBlock(address)

        const event = await client.waitFor((message) => message.type === 'event')
        const rpcUpdate = await rpcNext

        expect(event).toEqual({
          type: 'event',
          id: 'blocks',
          stream: 'block_updates',
          data: { address: BLOCKER, isBlocked: true }
        })
        expect({ address: rpcUpdate.address, isBlocked: rpcUpdate.isBlocked }).toEqual(event.data)
      })
    })

    describe('and the update is addressed to somebody else', () => {
      it('should not deliver it', async () => {
        const client = await open()
        client.send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
        await client.waitFor((message) => message.type === 'subscribed')
        await sleep(500)

        await publishBlock('0x2222222222222222222222222222222222222222')

        expect(await client.collect((message) => message.type === 'event', 1500)).toEqual([])
      })
    })

    describe('and the connection has not subscribed', () => {
      it('should not deliver it', async () => {
        const client = await open()
        await sleep(300)

        await publishBlock(address)

        expect(await client.collect((message) => message.type === 'event', 1500)).toEqual([])
      })
    })

    describe('and the client unsubscribed', () => {
      it('should confirm the end, stop delivering and allow subscribing again', async () => {
        const client = await open()
        client.send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
        await client.waitFor((message) => message.type === 'subscribed')
        await sleep(500)

        client.send({ type: 'unsubscribe', id: 'blocks' })
        const end = await client.waitFor((message) => message.type === 'end')
        expect(end).toMatchObject({ id: 'blocks', reason: 'unsubscribed' })

        await publishBlock(address)
        expect(await client.collect((message) => message.type === 'event', 1500)).toEqual([])

        client.send({ type: 'subscribe', id: 'blocks-again', stream: 'block_updates' })
        await client.waitFor((message) => message.type === 'subscribed' && message.id === 'blocks-again')
        await sleep(500)

        await publishBlock(address, false)
        const event = await client.waitFor((message) => message.type === 'event')
        expect(event).toMatchObject({ id: 'blocks-again', data: { address: BLOCKER, isBlocked: false } })
      })
    })

    describe('and the client unsubscribes immediately after subscribing', () => {
      it('should end the subscription cleanly and leak nothing', async () => {
        const client = await open()

        client.send({ type: 'subscribe', id: 'quick', stream: 'block_updates' })
        client.send({ type: 'unsubscribe', id: 'quick' })

        const end = await client.waitFor((message) => message.type === 'end')
        expect(end).toMatchObject({ id: 'quick', reason: 'unsubscribed' })

        client.send({ type: 'subscribe', id: 'again', stream: 'block_updates' })
        await client.waitFor((message) => message.type === 'subscribed' && message.id === 'again')
      })
    })
  })

  describe('when a friendship request is sent', () => {
    describe('and the receiver is subscribed to friendship updates over the stream socket', () => {
      it('should deliver the request with the requester address, without looking up their profile', async () => {
        const requester = await createTestIdentity()
        const requesterAddress = requester.realAccount.address.toLowerCase()
        stubComponents.registry.getProfiles.mockResolvedValue([
          createMockProfile(requesterAddress),
          createMockProfile(address)
        ])
        // The RPC stream would drop the event when the profile can't be resolved; this one must not need it.
        stubComponents.registry.getProfile.mockRejectedValue(new Error('profile not found'))

        const client = await open()
        client.send({ type: 'subscribe', id: 'friends', stream: 'friendship_updates' })
        await client.waitFor((message) => message.type === 'subscribed')
        await sleep(1000)

        await components.friends.upsertFriendship(requesterAddress, address, Action.REQUEST, {
          message: 'hello from the stream'
        })

        const event = await client.waitFor((message) => message.type === 'event')
        expect(event.stream).toBe('friendship_updates')
        expect(event.data).toEqual({
          action: 'request',
          id: expect.any(String),
          address: requesterAddress,
          createdAt: expect.any(Number),
          message: 'hello from the stream'
        })

        const friendship = await components.friendsDb.getFriendship([address, requesterAddress])
        if (friendship) {
          await components.friendsDb.updateFriendshipStatus(friendship.id, false)
        }
      })
    })
  })

  describe('when a private voice chat update is published', () => {
    describe('and the callee is subscribed to private voice chat updates', () => {
      it('should deliver the call with the caller and the status name', async () => {
        const callerAddress = '0x2222222222222222222222222222222222222222'
        const client = await open()
        client.send({ type: 'subscribe', id: 'calls', stream: 'private_voice_chat_updates' })
        await client.waitFor((message) => message.type === 'subscribed')
        await sleep(1000)

        await components.pubsub.publishInChannel(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
          callId: 'call-id',
          callerAddress,
          calleeAddress: address,
          status: VoiceChatStatus.REQUESTED
        })

        const event = await client.waitFor((message) => message.type === 'event')
        expect(event.data).toEqual({ callId: 'call-id', status: 'requested', callerAddress })
      })
    })
  })

  describe('when the same address has several connections', () => {
    describe('and two stream sockets subscribe to the same stream', () => {
      it('should deliver the update to both and keep delivering to the remaining one after the other closes', async () => {
        const first = await open()
        const second = await open()
        for (const client of [first, second]) {
          client.send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
          await client.waitFor((message) => message.type === 'subscribed')
        }
        await sleep(1000)

        await publishBlock(address)
        await first.waitFor((message) => message.type === 'event')
        await second.waitFor((message) => message.type === 'event')

        first.close()
        await first.closed
        await sleep(500)

        await publishBlock(address, false)
        const event = await second.waitFor((message) => message.type === 'event' && message.data.isBlocked === false)
        expect(event.data.address).toEqual(BLOCKER)
      })
    })

    describe('and one connection uses RPC while the other uses the stream protocol', () => {
      it('should deliver the update on both protocols', async () => {
        const rpc = await connectAuthenticatedRpcClient(components, identity)
        closers.push(rpc.close)
        const client = await open()

        const rpcNext = nextWithTimeout(rpc.client.subscribeToBlockUpdates({}))
        client.send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
        await client.waitFor((message) => message.type === 'subscribed')
        await sleep(1000)

        await publishBlock(address)

        const [rpcUpdate, event] = await Promise.all([rpcNext, client.waitFor((message) => message.type === 'event')])
        expect(rpcUpdate.isBlocked).toBe(true)
        expect(event.data.isBlocked).toBe(true)
      })

      it('should keep the RPC stream alive when the stream socket closes, and vice versa', async () => {
        const rpc = await connectAuthenticatedRpcClient(components, identity)
        const rpcStream = rpc.client.subscribeToBlockUpdates({})
        const client = await open()
        client.send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
        await client.waitFor((message) => message.type === 'subscribed')
        const firstRpc = nextWithTimeout(rpcStream)
        await sleep(1000)
        await publishBlock(address)
        await firstRpc

        client.close()
        await client.closed
        await sleep(500)

        const secondRpc = nextWithTimeout(rpcStream)
        await publishBlock(address, false)
        expect((await secondRpc).isBlocked).toBe(false)

        // And the other way around: a fresh stream socket works while the RPC one is the survivor.
        const another = await open()
        another.send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
        await another.waitFor((message) => message.type === 'subscribed')
        await sleep(500)
        rpc.close()
        await sleep(500)

        await publishBlock(address)
        await another.waitFor((message) => message.type === 'event')
      })

      it('should only end the private voice chat of the user when the last connection of either kind closes', async () => {
        const endVoiceChats = jest.spyOn(components.voice, 'endIncomingOrOutgoingPrivateVoiceChatForUser')
        endVoiceChats.mockResolvedValue(undefined)

        try {
          const rpc = await connectAuthenticatedRpcClient(components, identity)
          const client = await open()
          await sleep(300)

          client.close()
          await client.closed
          await sleep(500)
          expect(endVoiceChats).not.toHaveBeenCalled()

          rpc.close()
          await sleep(800)
          expect(endVoiceChats).toHaveBeenCalledTimes(1)
          expect(endVoiceChats).toHaveBeenCalledWith(address)
        } finally {
          endVoiceChats.mockRestore()
        }
      })

      it('should end the private voice chat when the only connection is a stream socket that closes', async () => {
        const endVoiceChats = jest.spyOn(components.voice, 'endIncomingOrOutgoingPrivateVoiceChatForUser')
        endVoiceChats.mockResolvedValue(undefined)

        try {
          const client = await open()
          client.close()
          await client.closed
          await sleep(800)

          expect(endVoiceChats).toHaveBeenCalledWith(address)
        } finally {
          endVoiceChats.mockRestore()
        }
      })
    })
  })

  describe('when connections close', () => {
    it('should release the pool slot, the fan-out entry and the generators', async () => {
      const connectionsBefore = components.wsPool.getConnectionIds().length
      const client = await open()
      client.send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
      await client.waitFor((message) => message.type === 'subscribed')
      expect(components.wsPool.getConnectionIds().length).toBe(connectionsBefore + 1)

      client.close()
      await client.closed
      await sleep(500)

      expect(components.wsPool.getConnectionIds().length).toBe(connectionsBefore)
      expect(components.subscribersContext.getLocalSubscribersAddresses()).not.toContain(address)
    })

    it('should release everything after many connect, subscribe and disconnect cycles', async () => {
      const connectionsBefore = components.wsPool.getConnectionIds().length

      for (let cycle = 0; cycle < 25; cycle++) {
        const cycleIdentity = await createTestIdentity()
        const client = await connectStreamClient(components, cycleIdentity)
        ;['block_updates', 'friendship_updates', 'community_voice_chat_updates'].forEach((stream, index) =>
          client.send({ type: 'subscribe', id: `s${index}`, stream })
        )
        await client.waitFor((message) => message.type === 'subscribed' && message.id === 's2')
        if (cycle % 2 === 0) {
          client.send({ type: 'unsubscribe', id: 's0' })
        }
        client.close()
        await client.closed
      }
      await sleep(1000)

      expect(components.wsPool.getConnectionIds().length).toBe(connectionsBefore)
      expect(components.subscribersContext.getLocalSubscribersAddresses()).toEqual([])
    })
  })
})
