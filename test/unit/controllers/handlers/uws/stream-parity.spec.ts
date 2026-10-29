import { SocialServiceDefinition } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createStreamRegistry } from '../../../../../src/controllers/handlers/uws/stream-registry'
import { setupRpcRoutes, RpcServiceCreators } from '../../../../../src/controllers/routes/rpc.routes'
import { createUpdateHandlerComponent } from '../../../../../src/logic/updates'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server/subscribers-context'
import { Action, AppComponents, ISubscribersContext } from '../../../../../src/types'
import {
  createLogsMockedComponent,
  createMockRegistry,
  createFriendsDBMockedComponent,
  createMockPeersStatsComponent,
  createMockConfigComponent,
  mockMetrics,
  mockCommunitiesDB
} from '../../../../mocks/components'
import { createWsPoolMockedComponent } from '../../../../mocks/components/ws-pool'
import { createMockCommunityMembersComponent } from '../../../../mocks/communities'
import { createMockProfile } from '../../../../mocks/profile'
import {
  ACTOR,
  RECIPIENT,
  STREAM_METHODS,
  createParityFixtures,
  normalizeRpc,
  RpcUpdate
} from '../../../../fixtures/stream-parity'

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('when comparing RPC and JSON subscription contracts', () => {
  let components: AppComponents
  let subscribers: ISubscribersContext
  let routes: RpcServiceCreators
  let streams: ReturnType<typeof createStreamRegistry>
  let rpc: AsyncGenerator<RpcUpdate>
  let json: AsyncGenerator<unknown>
  let registry: ReturnType<typeof createMockRegistry>
  let friendsDb: ReturnType<typeof createFriendsDBMockedComponent>

  beforeEach(async () => {
    const logs = createLogsMockedComponent()
    registry = createMockRegistry()
    registry.getProfile.mockImplementation(async (address) => createMockProfile(address))
    registry.getProfiles.mockResolvedValue([])
    friendsDb = createFriendsDBMockedComponent({})
    friendsDb.getOnlineFriends.mockResolvedValue([])
    const peersStats = createMockPeersStatsComponent()
    peersStats.getConnectedPeers.mockResolvedValue([])
    subscribers = createSubscribersContext(
      { logs, metrics: mockMetrics, config: createMockConfigComponent({}) },
      createWsPoolMockedComponent()
    )
    subscribers.addConnection(RECIPIENT, 'rpc')
    subscribers.addConnection(RECIPIENT, 'json')
    const updateHandler = createUpdateHandlerComponent({
      logs,
      registry,
      friendsDb,
      peersStats,
      subscribersContext: subscribers,
      metrics: mockMetrics,
      communitiesDb: mockCommunitiesDB,
      communityMembers: createMockCommunityMembersComponent({})
    })
    // Unary service factories are registered but never invoked by this subscription-only harness.
    components = { logs, registry, friendsDb, peersStats, updateHandler } as unknown as AppComponents
    routes = await setupRpcRoutes(components)
    streams = createStreamRegistry(components)
  })

  afterEach(async () => {
    subscribers.removeConnection(RECIPIENT, 'rpc')
    subscribers.removeConnection(RECIPIENT, 'json')
    await rpc?.return(undefined)
    await json?.return(undefined)
    jest.clearAllMocks()
  })

  it('should cover every server-streaming method in the generated RPC definition and route registry', () => {
    const methods = Object.entries(SocialServiceDefinition.methods)
      .filter(([, method]) => method.responseStream)
      .map(([name]) => name)
      .sort()
    expect(Object.values(STREAM_METHODS).sort()).toEqual(methods)
    expect(
      Object.keys(routes)
        .filter((name) => name.startsWith('subscribeTo'))
        .sort()
    ).toEqual(methods)
    expect(Object.keys(streams).sort()).toEqual(Object.keys(STREAM_METHODS).sort())
    expect([...new Set(createParityFixtures().map((fixture) => fixture.stream))].sort()).toEqual(
      Object.keys(streams).sort()
    )
    for (const [stream, method] of Object.entries(STREAM_METHODS)) expect(routes[method].event).toBe(stream)
  })

  describe.each(createParityFixtures())('and the event is $name', (fixture) => {
    let rpcNext: Promise<IteratorResult<RpcUpdate>>
    let jsonNext: Promise<IteratorResult<unknown>>

    beforeEach(async () => {
      rpc = routes[STREAM_METHODS[fixture.stream]].creator(
        {},
        { address: RECIPIENT, wsConnectionId: 'rpc', subscribersContext: subscribers }
      )
      json = streams[fixture.stream].open({
        address: RECIPIENT,
        wsConnectionId: 'json',
        subscribersContext: subscribers
      })
      rpcNext = rpc.next()
      jsonNext = json.next()
      await flush()
      subscribers.getSubscriber(RECIPIENT)?.emit(fixture.event, fixture.update)
    })

    it('should deliver equivalent payloads using the real RPC and JSON subscription implementations', async () => {
      const [rpcResult, jsonResult] = await Promise.all([rpcNext, jsonNext])
      expect(rpcResult.done).toBe(false)
      expect(jsonResult.done).toBe(false)
      expect(jsonResult.value).toEqual(normalizeRpc(fixture.stream, rpcResult.value))
      // Catch added/removed fields too, including fields a normalizer deliberately omits.
      expect({ rpc: rpcResult.value, json: jsonResult.value }).toMatchSnapshot()
    })
  })

  describe.each(['friendship_updates', 'friend_connectivity_updates', 'block_updates'] as const)(
    'and a %s event must be filtered out',
    (stream) => {
      let rpcNext: Promise<IteratorResult<RpcUpdate>>
      let jsonNext: Promise<IteratorResult<unknown>>

      beforeEach(async () => {
        rpc = routes[STREAM_METHODS[stream]].creator(
          {},
          { address: RECIPIENT, wsConnectionId: 'rpc', subscribersContext: subscribers }
        )
        json = streams[stream].open({ address: RECIPIENT, wsConnectionId: 'json', subscribersContext: subscribers })
        rpcNext = rpc.next()
        jsonNext = json.next()
        await flush()
        const emitter = subscribers.getSubscriber(RECIPIENT)
        if (stream === 'friendship_updates') {
          emitter?.emit('friendshipUpdate', {
            id: 'wrong-recipient',
            from: ACTOR,
            to: ACTOR,
            action: Action.REQUEST,
            timestamp: 1
          })
          emitter?.emit('friendshipUpdate', {
            id: 'self',
            from: RECIPIENT,
            to: RECIPIENT,
            action: Action.REQUEST,
            timestamp: 1
          })
        } else if (stream === 'friend_connectivity_updates') {
          emitter?.emit('friendConnectivityUpdate', { address: RECIPIENT, status: 0 })
        } else {
          emitter?.emit('blockUpdate', { blockerAddress: RECIPIENT, blockedAddress: ACTOR, isBlocked: true })
        }
        const fixture = createParityFixtures().find((item) => item.stream === stream)
        if (!fixture) throw new Error('Missing filter fixture')
        emitter?.emit(fixture.event, fixture.update)
      })

      it('should skip disallowed events and deliver the next eligible event on both protocols', async () => {
        const [rpcResult, jsonResult] = await Promise.all([rpcNext, jsonNext])
        expect(jsonResult.value).toEqual(normalizeRpc(stream, rpcResult.value))
        expect(jsonResult.value).toMatchObject({ address: ACTOR })
      })
    }
  )

  describe('and the initial online-friend snapshot is available', () => {
    beforeEach(() => {
      friendsDb.getOnlineFriends.mockResolvedValue([{ address: ACTOR }])
      registry.getProfiles.mockResolvedValue([createMockProfile(ACTOR)])
    })

    it('should deliver equivalent initial connectivity snapshots', async () => {
      rpc = routes.subscribeToFriendConnectivityUpdates.creator(
        {},
        { address: RECIPIENT, wsConnectionId: 'rpc', subscribersContext: subscribers }
      )
      json = streams.friend_connectivity_updates.open({
        address: RECIPIENT,
        wsConnectionId: 'json',
        subscribersContext: subscribers
      })
      expect((await json.next()).value).toEqual(normalizeRpc('friend_connectivity_updates', (await rpc.next()).value))
    })
  })

  describe.each(['friendship_updates', 'friend_connectivity_updates'] as const)(
    'and a profile cannot be resolved for %s',
    (stream) => {
      let jsonNext: Promise<IteratorResult<unknown>>
      let rpcNext: Promise<IteratorResult<RpcUpdate>>
      let rpcDelivered: boolean

      beforeEach(async () => {
        registry.getProfile.mockRejectedValue(new Error('Profile missing'))
        rpcDelivered = false
        rpc = routes[STREAM_METHODS[stream]].creator(
          {},
          { address: RECIPIENT, wsConnectionId: 'rpc', subscribersContext: subscribers }
        )
        json = streams[stream].open({ address: RECIPIENT, wsConnectionId: 'json', subscribersContext: subscribers })
        rpcNext = rpc.next()
        void rpcNext.then((result) => {
          rpcDelivered = !result.done
        })
        jsonNext = json.next()
        await flush()
        const fixture = createParityFixtures().find((item) => item.stream === stream)
        if (!fixture) throw new Error('Missing profile-difference fixture')
        subscribers.getSubscriber(RECIPIENT)?.emit(fixture.event, fixture.update)
        await flush()
      })

      it('should intentionally keep JSON delivery while RPC skips the event', async () => {
        expect((await jsonNext).done).toBe(false)
        expect(rpcDelivered).toBe(false)
        expect(registry.getProfile).toHaveBeenCalledTimes(1)
      })
    }
  )
})
