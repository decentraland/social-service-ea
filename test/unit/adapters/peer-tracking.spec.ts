import { readFileSync } from 'fs'
import { resolve } from 'path'
import { ParcelChangesBatch } from '@dcl/pulse-protocol/out-js/decentraland/pulse/pulse_presence.gen'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { NatsMsg } from '@well-known-components/nats-component/dist/types'
import {
  createPeerTrackingComponent,
  parcelChangesToStatusEvents,
  PARCEL_CHANGES_SUBJECT,
  PEER_STATUS_KEY_PREFIX,
  STATUS_PUBLISH_CHUNK_SIZE
} from '../../../src/adapters/peer-tracking'
import {
  COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL,
  FRIEND_STATUS_UPDATES_CHANNEL
} from '../../../src/adapters/pubsub'
import { createMockConfigComponent, mockLogs, mockNats, mockPubSub, mockRedis } from '../../mocks/components'
import { IPeerTrackingComponent } from '../../../src/types'

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

  function buildConfig() {
    return createMockConfigComponent({
      getNumber: jest.fn(async (_key: string) => undefined)
    })
  }

  async function createComponent() {
    return createPeerTrackingComponent({
      logs: mockLogs,
      nats: mockNats,
      pubsub: mockPubSub,
      redis: mockRedis,
      config: buildConfig()
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

  describe('when subscribing', () => {
    beforeEach(async () => {
      peerTracking = await createComponent()
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
    })

    describe('and a snapshot far larger than the publish chunk size arrives', () => {
      const SNAPSHOT_SIZE = 250

      function bigSnapshot() {
        const changes = Array.from({ length: SNAPSHOT_SIZE }, (_, index) => ({
          address: `0x${(index + 1).toString(16).padStart(40, '0')}`,
          realm: 'main',
          parcel: { x: index, y: index }
        }))
        const data = ParcelChangesBatch.encode({
          serverName: 'pulse-1',
          seq: 1,
          snapshot: true,
          serverTime: 0,
          changes
        }).finish()

        return { changes, message: { subject: PARCEL_CHANGES_SUBJECT, data } as NatsMsg }
      }

      it('should publish one event per entry, still with a single MGET', async () => {
        const handler = getParcelChangesHandler()
        const { changes, message } = bigSnapshot()

        await handler(null, message)

        const events = emittedFriendEvents()
        expect(events).toHaveLength(SNAPSHOT_SIZE)
        expect(new Set(events.map((event) => event.address))).toEqual(new Set(changes.map((change) => change.address)))
        expect(events.every((event) => event.status === ConnectivityStatus.ONLINE)).toBe(true)
        expect(mockRedis.client.mGet).toHaveBeenCalledTimes(1)
      })

      it('should apply the other 249 wallets when the seventh status write fails', async () => {
        const { changes, message } = bigSnapshot()
        const failedKey = PEER_STATUS_KEY_PREFIX + changes[6].address
        mockRedis.put.mockImplementation(async (key: string, value: unknown) => {
          if (key === failedKey) throw new Error('Redis write failed')
          redisStore.set(key, JSON.stringify(value))
        })
        await getParcelChangesHandler()(null, message)
        expect(mockRedis.put).toHaveBeenCalledTimes(SNAPSHOT_SIZE)
        expect(redisStore.has(failedKey)).toBe(false)
        const expected = changes
          .filter((_, index) => index !== 6)
          .map(({ address }) => ({ address, status: ConnectivityStatus.ONLINE }))
        expect(emittedFriendEvents()).toEqual(expected)
        for (const { address } of expected) {
          expect(redisStore.get(PEER_STATUS_KEY_PREFIX + address)).toBe(JSON.stringify(ConnectivityStatus.ONLINE))
        }
        expect(mockLogs.getLogger('peer-tracking-component').error).toHaveBeenCalledTimes(1)
        expect(mockLogs.getLogger('peer-tracking-component').error).toHaveBeenCalledWith(
          'Error applying peer status changes',
          { failedCount: 1, error: 'Redis write failed' }
        )
      })

      it('should bound the write/publish fan-out to the chunk size', async () => {
        const handler = getParcelChangesHandler()
        const { message } = bigSnapshot()
        let inFlight = 0
        let maxInFlight = 0

        mockRedis.put.mockImplementation(async (key: string, value: unknown) => {
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          await Promise.resolve()
          redisStore.set(key, JSON.stringify(value))
          inFlight--
        })

        await handler(null, message)

        expect(maxInFlight).toBeLessThanOrEqual(STATUS_PUBLISH_CHUNK_SIZE)
        // and not serialised one peer at a time either
        expect(maxInFlight).toBeGreaterThan(1)
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

  describe('when the NATS subscription itself fails', () => {
    it('should log the error and leave no subscription registered', async () => {
      peerTracking = await createComponent()
      const subscribeError = new Error('NATS subscription failed')
      mockNats.subscribe.mockImplementationOnce(() => {
        throw subscribeError
      })

      await peerTracking.subscribeToPeerStatusUpdates()

      expect(mockLogs.getLogger('peer-tracking-component').error).toHaveBeenCalledWith(
        `Error subscribing to ${PARCEL_CHANGES_SUBJECT}`,
        { error: subscribeError.message }
      )
      expect(peerTracking.getSubscriptions().size).toBe(0)
    })
  })
})
