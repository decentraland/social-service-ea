import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { Friend, RpcServerContext } from '../../../../../src/types'
import { mockLogs, mockArchipelagoStats, mockDb } from '../../../../mocks/components'
import { subscribeToFriendUpdatesService } from '../../../../../src/adapters/rpc-server/services/subscribe-to-friend-updates'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

describe('subscribeToFriendStatusService', () => {
  let subscribeToFriendUpdates: ReturnType<typeof subscribeToFriendUpdatesService>
  let rpcContext: RpcServerContext

  beforeEach(() => {
    subscribeToFriendUpdates = subscribeToFriendUpdatesService({
      components: {
        logs: mockLogs,
        db: mockDb,
        archipelagoStats: mockArchipelagoStats
      }
    })

    rpcContext = {
      address: '0x123',
      subscribers: {}
    }

    mockDb.streamOnlineFriends.mockImplementationOnce(async function* () {
      yield { address: '0x456' }
    })
  })

  it('should get initial online friends from archipelago stats', async () => {
    mockArchipelagoStats.getPeers.mockResolvedValue(['0x456', '0x789'])

    const generator = subscribeToFriendUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    expect(mockArchipelagoStats.getPeersFromCache).toHaveBeenCalled()
    expect(result.value).toEqual({
      user: { address: '0x456' },
      status: ConnectivityStatus.ONLINE
    })
  })

  it('should add the status subscriber to context', async () => {
    const generator = subscribeToFriendUpdates({} as Empty, rpcContext)
    generator.next()

    expect(rpcContext.subscribers['0x123']).toBeDefined()
    generator.return(undefined)
  })

  it.todo('should yield parsed updates when an update is emitted')
  it.todo('should skip unparsable updates')
})
