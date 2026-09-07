import { readFileSync } from 'fs'
import { resolve } from 'path'
import { ParcelChangesBatch } from '@dcl/protocol/out-js/decentraland/pulse/pulse_presence.gen'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { NatsMsg } from '@well-known-components/nats-component/dist/types'
import {
  createPeerTrackingComponent,
  parcelChangesToStatusEvents,
  PARCEL_CHANGES_SUBJECT,
  PEER_STATUS_HANDLERS,
  PEER_STATUS_KEY_PREFIX,
  PeerStatusHandlerEvent,
  PRESENCE_DIFF_INTERVAL_MS
} from '../../../src/adapters/peer-tracking'
import {
  COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL,
  FRIEND_STATUS_UPDATES_CHANNEL
} from '../../../src/adapters/pubsub'
import {
  createMockConfigComponent,
  mockLogs,
  mockNats,
  mockPubSub,
  mockRedis,
  mockWorldsStats
} from '../../mocks/components'
import { IPeerTrackingComponent } from '../../../src/types'
import { PEERS_CACHE_KEY, PEERS_CACHE_KEY_PULSE } from '../../../src/utils/peers'

const FIXTURES_DIR = resolve(__dirname, '../../fixtures/iteration-2/parcel_changes')

type ReplayStep = {
  apply: string
  statusEvents: { address: string; status: 'ONLINE' | 'OFFLINE' }[]
}

const replay: { steps: ReplayStep[] } = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'replay.json'), 'utf8'))

type StatusEvent = { address: string; status: ConnectivityStatus }

function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(FIXTURES_DIR, name)))
}

function parcelChangesMessage(name: string): NatsMsg {
  return { subject: PARCEL_CHANGES_SUBJECT, data: readFixture(name) }
}

function expectedEvents(step: ReplayStep): StatusEvent[] {
  return step.statusEvents.map(({ address, status }) => ({
    address,
    status: status === 'ONLINE' ? ConnectivityStatus.ONLINE : ConnectivityStatus.OFFLINE
  }))
}

/**
 * The fixture's `statusEvents` are the events C5 derives from a batch: one per `ParcelChange`,
 * regardless of what the consumer already knows. What actually reaches the pubsub channels is that
 * list minus the peers whose cached status already matches (the dedupe that makes snapshot batches
 * idempotent), so the ordered replay expectation has to be folded the same way.
 */
function dedupedReplay(): { apply: string; published: StatusEvent[] }[] {
  const cached = new Map<string, ConnectivityStatus>()

  return replay.steps.map((step) => {
    const published: StatusEvent[] = []

    for (const event of expectedEvents(step)) {
      if (cached.get(event.address) !== event.status) {
        cached.set(event.address, event.status)
        published.push(event)
      }
    }

    return { apply: step.apply, published }
  })
}

function emittedFriendEvents(): StatusEvent[] {
  return mockPubSub.publishInChannel.mock.calls
    .filter(([channel]) => channel === FRIEND_STATUS_UPDATES_CHANNEL)
    .map(([, update]) => update as StatusEvent)
}

describe('PeerTrackingComponent', () => {
  let peerTracking: IPeerTrackingComponent
  let redisStore: Map<string, string>

  function buildConfig(presenceSource?: string) {
    return createMockConfigComponent({
      getString: jest.fn(async (key: string) => (key === 'PRESENCE_SOURCE' ? presenceSource : undefined)),
      getNumber: jest.fn(async (_key: string) => undefined)
    })
  }

  async function createComponent(presenceSource?: string) {
    return createPeerTrackingComponent({
      logs: mockLogs,
      nats: mockNats,
      pubsub: mockPubSub,
      redis: mockRedis,
      config: buildConfig(presenceSource),
      worldsStats: mockWorldsStats
    })
  }

  function getParcelChangesHandler() {
    const call = mockNats.subscribe.mock.calls.find(([subject]) => subject === PARCEL_CHANGES_SUBJECT)
    return call?.[1] as (err: Error | null, msg: NatsMsg) => Promise<void>
  }

  beforeEach(() => {
    jest.clearAllMocks()
    redisStore = new Map<string, string>()
    mockRedis.put.mockImplementation(async (key: string, value: unknown) => {
      redisStore.set(key, JSON.stringify(value))
    })
    mockRedis.get.mockImplementation(async (key: string) => {
      const raw = redisStore.get(key)
      return raw === undefined ? null : JSON.parse(raw)
    })
    ;(mockRedis.client.mGet as jest.Mock).mockImplementation(async (keys: string[]) =>
      keys.map((key) => redisStore.get(key) ?? null)
    )
  })

  describe('when mapping a decoded batch to status events', () => {
    it.each(replay.steps.map((step) => [step.apply, step] as const))(
      'should derive exactly the events replay.json pins for %s',
      (_name, step) => {
        const batch = ParcelChangesBatch.decode(readFixture(step.apply))

        expect(parcelChangesToStatusEvents(batch)).toEqual(expectedEvents(step))
      }
    )

    it('should treat an empty parcel as the (0,0) placement it is, not as an exit', () => {
      const batch = ParcelChangesBatch.decode(readFixture('01-snapshot.bin'))

      expect(batch.serverName).toBe('pulse-1')
      expect(batch.snapshot).toBe(true)
      expect(batch.changes).toHaveLength(5)
      expect(batch.changes[2].parcel).toEqual({ x: 0, y: 0 })
      expect(parcelChangesToStatusEvents(batch)[2]).toEqual({
        address: '0x0000000000000000000000000000000000000003',
        status: ConnectivityStatus.ONLINE
      })
    })

    it('should read an absent parcel as OFFLINE', () => {
      const batch = ParcelChangesBatch.decode(readFixture('03-exit.bin'))

      expect(batch.changes[0].parcel).toBeUndefined()
      expect(parcelChangesToStatusEvents(batch)).toEqual([
        { address: '0x0000000000000000000000000000000000000001', status: ConnectivityStatus.OFFLINE }
      ])
    })
  })

  describe('when PRESENCE_SOURCE is not set', () => {
    beforeEach(async () => {
      peerTracking = await createComponent(undefined)
      await peerTracking.subscribeToPeerStatusUpdates()
    })

    it('should keep the legacy peer.* subscriptions only', () => {
      expect(mockNats.subscribe).toHaveBeenCalledTimes(PEER_STATUS_HANDLERS.length)
      PEER_STATUS_HANDLERS.forEach((handler) => {
        expect(mockNats.subscribe).toHaveBeenCalledWith(handler.pattern, expect.any(Function))
      })
      expect(mockNats.subscribe).not.toHaveBeenCalledWith(PARCEL_CHANGES_SUBJECT, expect.any(Function))
    })
  })

  describe('when PRESENCE_SOURCE is an unrecognised value', () => {
    beforeEach(async () => {
      peerTracking = await createComponent('pulsee')
      await peerTracking.subscribeToPeerStatusUpdates()
    })

    it('should fall back to the legacy subscriptions', () => {
      expect(mockNats.subscribe).toHaveBeenCalledTimes(PEER_STATUS_HANDLERS.length)
      expect(mockNats.subscribe).not.toHaveBeenCalledWith(PARCEL_CHANGES_SUBJECT, expect.any(Function))
    })
  })

  describe('when PRESENCE_SOURCE is pulse', () => {
    beforeEach(async () => {
      peerTracking = await createComponent('pulse')
      await peerTracking.subscribeToPeerStatusUpdates()
    })

    it('should subscribe exactly once, to engine.parcel_changes', () => {
      expect(mockNats.subscribe).toHaveBeenCalledTimes(1)
      expect(mockNats.subscribe).toHaveBeenCalledWith(PARCEL_CHANGES_SUBJECT, expect.any(Function))
      expect(peerTracking.getSubscriptions().size).toBe(1)
    })

    it('should not subscribe to any peer.* subject', () => {
      const subjects = mockNats.subscribe.mock.calls.map(([subject]) => subject)
      expect(subjects.filter((subject) => subject.startsWith('peer.'))).toEqual([])
    })

    describe('and the fixture replay is fed batch by batch', () => {
      it('should publish the derived status events, deduped against the cache, for every step', async () => {
        const handler = getParcelChangesHandler()

        for (const step of dedupedReplay()) {
          mockPubSub.publishInChannel.mockClear()

          await handler(null, parcelChangesMessage(step.apply))

          expect(emittedFriendEvents()).toEqual(step.published)
        }
      })

      it('should leave the whole replay population cached with its last known status', async () => {
        const handler = getParcelChangesHandler()

        for (const step of replay.steps) {
          await handler(null, parcelChangesMessage(step.apply))
        }

        const cached = Object.fromEntries(
          [...redisStore.entries()]
            .filter(([key]) => key.startsWith(PEER_STATUS_KEY_PREFIX))
            .map(([key, value]) => [key.slice(PEER_STATUS_KEY_PREFIX.length), JSON.parse(value)])
        )

        expect(cached).toEqual({
          '0x0000000000000000000000000000000000000001': ConnectivityStatus.OFFLINE,
          '0x0000000000000000000000000000000000000002': ConnectivityStatus.ONLINE,
          '0x0000000000000000000000000000000000000003': ConnectivityStatus.ONLINE,
          '0x0000000000000000000000000000000000000004': ConnectivityStatus.ONLINE,
          '0x0000000000000000000000000000000000000005': ConnectivityStatus.ONLINE,
          '0x0000000000000000000000000000000000000007': ConnectivityStatus.ONLINE,
          '0x00000000000000000000000000000000000000ab': ConnectivityStatus.ONLINE
        })
      })

      it('should not flip a peer missing from a snapshot to OFFLINE', async () => {
        const handler = getParcelChangesHandler()

        await handler(null, parcelChangesMessage('01-snapshot.bin'))
        mockPubSub.publishInChannel.mockClear()

        // 10-snapshot-restart carries only W2 and W4; W1/W3/W5 are absent from it
        await handler(null, parcelChangesMessage('10-snapshot-restart.bin'))

        expect(emittedFriendEvents()).toEqual([])
        expect(redisStore.get(`${PEER_STATUS_KEY_PREFIX}0x0000000000000000000000000000000000000005`)).toBe(
          JSON.stringify(ConnectivityStatus.ONLINE)
        )
      })

      it('should publish the connectivity update to the community channel as well', async () => {
        const handler = getParcelChangesHandler()

        await handler(null, parcelChangesMessage('01-snapshot.bin'))

        expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL, {
          memberAddress: '0x0000000000000000000000000000000000000001',
          status: ConnectivityStatus.ONLINE
        })
      })
    })

    describe('and the same snapshot is replayed twice', () => {
      it('should not emit a second flip', async () => {
        const handler = getParcelChangesHandler()

        await handler(null, parcelChangesMessage('01-snapshot.bin'))
        expect(emittedFriendEvents()).toHaveLength(5)

        mockPubSub.publishInChannel.mockClear()
        mockRedis.put.mockClear()

        await handler(null, parcelChangesMessage('01-snapshot.bin'))

        expect(emittedFriendEvents()).toEqual([])
        expect(mockRedis.put).not.toHaveBeenCalled()
      })
    })

    describe('and a batch is processed', () => {
      it('should read the cached statuses with a single MGET holding every address of the batch', async () => {
        const handler = getParcelChangesHandler()

        await handler(null, parcelChangesMessage('01-snapshot.bin'))

        expect(mockRedis.client.mGet).toHaveBeenCalledTimes(1)
        expect(mockRedis.client.mGet).toHaveBeenCalledWith([
          'peer-status:0x0000000000000000000000000000000000000001',
          'peer-status:0x0000000000000000000000000000000000000002',
          'peer-status:0x0000000000000000000000000000000000000003',
          'peer-status:0x0000000000000000000000000000000000000004',
          'peer-status:0x0000000000000000000000000000000000000005'
        ])
        expect(mockRedis.get).not.toHaveBeenCalled()
      })

      it('should not touch worlds stats', async () => {
        const handler = getParcelChangesHandler()

        await handler(null, parcelChangesMessage('01-snapshot.bin'))

        expect(mockWorldsStats.onPeerConnect).not.toHaveBeenCalled()
        expect(mockWorldsStats.onPeerDisconnect).not.toHaveBeenCalled()
      })
    })

    describe('and a batch violating the lowercase-realm rule arrives', () => {
      it('should log the violation, still apply the change and never throw', async () => {
        const handler = getParcelChangesHandler()

        await expect(handler(null, parcelChangesMessage('07-invalid-mixed-case-realm.bin'))).resolves.not.toThrow()

        expect(emittedFriendEvents()).toEqual([
          { address: '0x0000000000000000000000000000000000000001', status: ConnectivityStatus.ONLINE }
        ])
        expect(mockLogs.getLogger('peer-tracking-component').warn).toHaveBeenCalledWith(
          'Contract violation: parcel change with a non-canonical realm',
          expect.objectContaining({ realm: 'Main', serverName: 'pulse-1' })
        )
      })
    })

    describe('and a batch carries a non-canonical address', () => {
      it('should log the violation and key the peer by its lowercase address', async () => {
        const handler = getParcelChangesHandler()
        const batch = ParcelChangesBatch.encode({
          serverName: 'pulse-1',
          seq: 1,
          snapshot: false,
          serverTime: 0,
          changes: [
            {
              address: '0x00000000000000000000000000000000000000AB',
              realm: 'main',
              parcel: { x: 5, y: 6 }
            }
          ]
        }).finish()

        await handler(null, { subject: PARCEL_CHANGES_SUBJECT, data: batch })

        expect(emittedFriendEvents()).toEqual([
          { address: '0x00000000000000000000000000000000000000ab', status: ConnectivityStatus.ONLINE }
        ])
        expect(mockLogs.getLogger('peer-tracking-component').warn).toHaveBeenCalledWith(
          'Contract violation: parcel change with a non-canonical address',
          expect.objectContaining({ serverName: 'pulse-1' })
        )
      })
    })

    describe('and the message cannot be decoded', () => {
      it('should log the error and never throw', async () => {
        const handler = getParcelChangesHandler()

        await expect(
          handler(null, { subject: PARCEL_CHANGES_SUBJECT, data: new Uint8Array([0xff, 0xff, 0xff, 0xff]) })
        ).resolves.not.toThrow()

        expect(mockLogs.getLogger('peer-tracking-component').error).toHaveBeenCalled()
        expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
      })
    })

    describe('and the subscription callback receives an error', () => {
      it('should log it and publish nothing', async () => {
        const handler = getParcelChangesHandler()

        await handler(new Error('NATS error'), parcelChangesMessage('01-snapshot.bin'))

        expect(mockLogs.getLogger('peer-tracking-component').error).toHaveBeenCalled()
        expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
      })
    })

    describe('and stopping', () => {
      it('should unsubscribe and clear the subscription', async () => {
        await peerTracking.stop()

        expect(peerTracking.getSubscriptions().size).toBe(0)
      })
    })
  })

  describe('when PRESENCE_SOURCE is both', () => {
    beforeEach(async () => {
      peerTracking = await createComponent('both')
      await peerTracking.subscribeToPeerStatusUpdates()
    })

    afterEach(async () => {
      await peerTracking.stop()
    })

    it('should run the legacy handlers and the parcel-changes handler at the same time', () => {
      expect(mockNats.subscribe).toHaveBeenCalledTimes(PEER_STATUS_HANDLERS.length + 1)
      expect(mockNats.subscribe).toHaveBeenCalledWith(PARCEL_CHANGES_SUBJECT, expect.any(Function))
      PEER_STATUS_HANDLERS.forEach((handler) => {
        expect(mockNats.subscribe).toHaveBeenCalledWith(handler.pattern, expect.any(Function))
      })
    })
  })

  describe('when PRESENCE_SOURCE is both and the diff logger ticks', () => {
    beforeEach(async () => {
      jest.useFakeTimers()
      peerTracking = await createComponent('both')
      await peerTracking.subscribeToPeerStatusUpdates()
    })

    afterEach(async () => {
      await peerTracking.stop()
      jest.useRealTimers()
    })

    it('should log the symmetric difference as counts only, never addresses', async () => {
      mockRedis.get.mockImplementation(async (key: string) => {
        if (key === PEERS_CACHE_KEY) return ['0xaaa', '0xbbb'] as any
        if (key === PEERS_CACHE_KEY_PULSE) return ['0xbbb', '0xccc'] as any
        return null
      })

      const parcelChangesHandler = getParcelChangesHandler()
      await parcelChangesHandler(null, parcelChangesMessage('03-exit.bin'))

      await jest.advanceTimersByTimeAsync(PRESENCE_DIFF_INTERVAL_MS)

      const logged = (mockLogs.getLogger('peer-tracking-component').info as jest.Mock).mock.calls.find(
        ([message]) => message === 'Presence source diff'
      )
      expect(logged).toBeDefined()
      expect(logged![1]).toEqual({
        archipelagoPeers: 2,
        pulsePeers: 2,
        onlyInArchipelago: 1,
        onlyInPulse: 1,
        symmetricDifference: 2,
        archipelagoFlips: 0,
        pulseFlips: 1
      })
      expect(JSON.stringify(logged![1])).not.toContain('0x')
    })

    it('should reset the per-window flip counters after every line', async () => {
      mockRedis.get.mockResolvedValue([] as any)

      const parcelChangesHandler = getParcelChangesHandler()
      await parcelChangesHandler(null, parcelChangesMessage('01-snapshot.bin'))

      await jest.advanceTimersByTimeAsync(PRESENCE_DIFF_INTERVAL_MS)
      await jest.advanceTimersByTimeAsync(PRESENCE_DIFF_INTERVAL_MS)

      const lines = (mockLogs.getLogger('peer-tracking-component').info as jest.Mock).mock.calls
        .filter(([message]) => message === 'Presence source diff')
        .map(([, extra]) => extra.pulseFlips)

      expect(lines).toEqual([5, 0])
    })

    it('should stop logging once the component is stopped', async () => {
      mockRedis.get.mockResolvedValue([] as any)

      await peerTracking.stop()
      await jest.advanceTimersByTimeAsync(PRESENCE_DIFF_INTERVAL_MS * 3)

      const lines = (mockLogs.getLogger('peer-tracking-component').info as jest.Mock).mock.calls.filter(
        ([message]) => message === 'Presence source diff'
      )
      expect(lines).toEqual([])
    })
  })

  describe('when PRESENCE_SOURCE is archipelago', () => {
    beforeEach(async () => {
      peerTracking = await createComponent('archipelago')
    })

    describe('and subscribing', () => {
      it('should subscribe to all legacy peer status patterns', async () => {
        await peerTracking.subscribeToPeerStatusUpdates()

        const subscriptions = peerTracking.getSubscriptions()
        expect(subscriptions.size).toBe(PEER_STATUS_HANDLERS.length)

        PEER_STATUS_HANDLERS.forEach((handler) => {
          expect(mockNats.subscribe).toHaveBeenCalledWith(handler.pattern, expect.any(Function))
          expect(subscriptions.has(handler.event)).toBe(true)
        })
      })

      it('should handle subscription errors gracefully', async () => {
        const subscribeError = new Error('NATS subscription failed')
        mockNats.subscribe.mockImplementationOnce(() => {
          throw subscribeError
        })

        await peerTracking.subscribeToPeerStatusUpdates()

        expect(mockLogs.getLogger('peer-tracking-component').error).toHaveBeenCalledWith(
          `Error subscribing to ${PEER_STATUS_HANDLERS[0].pattern}`,
          { error: subscribeError.message }
        )
        expect(peerTracking.getSubscriptions().size).toBe(PEER_STATUS_HANDLERS.length - 1)
      })

      it('should not start the diff logger', async () => {
        jest.useFakeTimers()
        try {
          await peerTracking.subscribeToPeerStatusUpdates()
          await jest.advanceTimersByTimeAsync(PRESENCE_DIFF_INTERVAL_MS * 2)

          const lines = (mockLogs.getLogger('peer-tracking-component').info as jest.Mock).mock.calls.filter(
            ([message]) => message === 'Presence source diff'
          )
          expect(lines).toEqual([])
        } finally {
          await peerTracking.stop()
          jest.useRealTimers()
        }
      })
    })

    describe('and stopping', () => {
      it('should unsubscribe and clear all subscriptions', async () => {
        await peerTracking.subscribeToPeerStatusUpdates()
        await peerTracking.stop()

        expect(peerTracking.getSubscriptions().size).toBe(0)
      })
    })

    describe('and messages arrive', () => {
      PEER_STATUS_HANDLERS.forEach((handler) => {
        it(`should handle ${handler.event} messages and update cache only when status changes`, async () => {
          await peerTracking.subscribeToPeerStatusUpdates()

          const messageHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === handler.pattern)?.[1]
          expect(messageHandler).toBeDefined()

          await messageHandler!(null, { subject: `peer.0x123.${handler.event}`, data: undefined as any })

          expect(mockRedis.put).toHaveBeenCalledWith('peer-status:0x123', handler.status, expect.any(Object))
          expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, {
            address: '0x123',
            status: handler.status
          })

          mockRedis.put.mockClear()
          mockPubSub.publishInChannel.mockClear()

          await messageHandler!(null, { subject: `peer.0x123.${handler.event}`, data: undefined as any })

          expect(mockRedis.put).not.toHaveBeenCalled()
          expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
        })

        it(`should handle ${handler.event} message errors`, async () => {
          await peerTracking.subscribeToPeerStatusUpdates()

          const messageHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === handler.pattern)?.[1]

          await messageHandler!(new Error('Test error'), {
            subject: `peer.0x123.${handler.event}`,
            data: undefined as any
          })

          expect(mockRedis.put).not.toHaveBeenCalled()
          expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
        })

        it(`should handle Redis errors gracefully on ${handler.event}`, async () => {
          await peerTracking.subscribeToPeerStatusUpdates()

          const messageHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === handler.pattern)?.[1]
          ;(mockRedis.client.mGet as jest.Mock).mockRejectedValueOnce(new Error('Redis error'))

          await messageHandler!(null, { subject: `peer.0x123.${handler.event}`, data: undefined as any })

          expect(mockPubSub.publishInChannel).not.toHaveBeenCalled()
          expect(mockLogs.getLogger('peer-tracking-component').error).toHaveBeenCalled()
        })
      })
    })

    describe('and world events arrive', () => {
      it('should handle join_world event and notify world stats', async () => {
        await peerTracking.subscribeToPeerStatusUpdates()

        const joinWorldHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === 'peer.*.world.join')?.[1]
        expect(joinWorldHandler).toBeDefined()

        await joinWorldHandler!(null, { subject: 'peer.0x123.world.join', data: undefined as any })

        expect(mockRedis.put).toHaveBeenCalledWith('peer-status:0x123', ConnectivityStatus.ONLINE, expect.any(Object))
        expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, {
          address: '0x123',
          status: ConnectivityStatus.ONLINE
        })
        expect(mockWorldsStats.onPeerConnect).toHaveBeenCalledWith('0x123')
      })

      it('should handle leave_world event and notify world stats', async () => {
        await peerTracking.subscribeToPeerStatusUpdates()

        const leaveWorldHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === 'peer.*.world.leave')?.[1]
        expect(leaveWorldHandler).toBeDefined()

        await leaveWorldHandler!(null, { subject: 'peer.0x123.world.leave', data: undefined as any })

        expect(mockWorldsStats.onPeerDisconnect).toHaveBeenCalledWith('0x123')
      })

      it.each([PeerStatusHandlerEvent.CONNECT, PeerStatusHandlerEvent.DISCONNECT, PeerStatusHandlerEvent.HEARTBEAT])(
        'should notify world disconnection when %s message is received',
        async (event) => {
          await peerTracking.subscribeToPeerStatusUpdates()

          const handler = mockNats.subscribe.mock.calls.find((call) => call[0] === `peer.*.${event}`)?.[1]
          expect(handler).toBeDefined()

          await handler!(null, { subject: `peer.0x123.${event}`, data: undefined as any })

          expect(mockWorldsStats.onPeerDisconnect).toHaveBeenCalledWith('0x123')
        }
      )

      it('should handle world stats errors gracefully', async () => {
        await peerTracking.subscribeToPeerStatusUpdates()

        const joinWorldHandler = mockNats.subscribe.mock.calls.find((call) => call[0] === 'peer.*.world.join')?.[1]
        expect(joinWorldHandler).toBeDefined()

        mockWorldsStats.onPeerConnect.mockRejectedValueOnce(new Error('World stats error'))

        await joinWorldHandler!(null, { subject: 'peer.0x123.world.join', data: undefined as any })

        expect(mockRedis.put).toHaveBeenCalledWith('peer-status:0x123', ConnectivityStatus.ONLINE, expect.any(Object))
        expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIEND_STATUS_UPDATES_CHANNEL, {
          address: '0x123',
          status: ConnectivityStatus.ONLINE
        })
        expect(mockLogs.getLogger('peer-tracking-component').error).toHaveBeenCalledWith(
          'Error handling peer event:',
          expect.objectContaining({ error: 'World stats error', peerId: '0x123' })
        )
      })
    })
  })
})
