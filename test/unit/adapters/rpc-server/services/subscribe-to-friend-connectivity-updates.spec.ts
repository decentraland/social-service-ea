import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { Friend, RpcServerContext } from '../../../../../src/types'
import { mockLogs, mockArchipelagoStats, mockDb, mockConfig, mockCatalystClient } from '../../../../mocks/components'
import { subscribeToFriendConnectivityUpdatesService } from '../../../../../src/adapters/rpc-server/services/subscribe-to-friend-connectivity-updates'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { mockProfile, PROFILE_IMAGES_URL } from '../../../../mocks/profile'
import { parseProfileToFriend } from '../../../../../src/logic/friends'

describe('subscribeToFriendConnectivityUpdatesService', () => {
  let subscribeToFriendConnectivityUpdates: Awaited<ReturnType<typeof subscribeToFriendConnectivityUpdatesService>>
  let rpcContext: RpcServerContext

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue(PROFILE_IMAGES_URL)

    subscribeToFriendConnectivityUpdates = await subscribeToFriendConnectivityUpdatesService({
      components: {
        logs: mockLogs,
        db: mockDb,
        archipelagoStats: mockArchipelagoStats,
        config: mockConfig,
        catalystClient: mockCatalystClient
      }
    })

    rpcContext = {
      address: '0x123',
      subscribers: {}
    }

    mockDb.streamOnlineFriends.mockImplementationOnce(async function* () {
      yield { address: '0x456' }
    })

    mockCatalystClient.getEntityByPointer.mockResolvedValueOnce(mockProfile)
  })

  it('should get initial online friends from archipelago stats', async () => {
    mockArchipelagoStats.getPeers.mockResolvedValue(['0x456', '0x789'])

    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    expect(mockArchipelagoStats.getPeersFromCache).toHaveBeenCalled()
    expect(result.value).toEqual({
      friend: parseProfileToFriend(mockProfile, PROFILE_IMAGES_URL),
      status: ConnectivityStatus.ONLINE
    })
  })

  it('should add the status subscriber to context', async () => {
    const generator = subscribeToFriendConnectivityUpdates({} as Empty, rpcContext)
    generator.next()

    expect(rpcContext.subscribers['0x123']).toBeDefined()
    generator.return(undefined)
  })

  it.todo('should yield parsed updates when an update is emitted')
  it.todo('should skip unparsable updates')
})
