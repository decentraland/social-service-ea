import { subscribeToFriendshipUpdatesService } from '../../../../../src/adapters/rpc-server/services/subscribe-to-friendship-updates'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, AppComponents } from '../../../../../src/types'
import { mockCatalystClient, mockConfig, mockLogs } from '../../../../mocks/components'
import { PROFILE_IMAGES_URL } from '../../../../mocks/profile'

describe('subscribeToFriendshipUpdatesService', () => {
  let subscribeToUpdates: Awaited<ReturnType<typeof subscribeToFriendshipUpdatesService>>

  let rpcContext: RpcServerContext

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue(PROFILE_IMAGES_URL)

    subscribeToUpdates = await subscribeToFriendshipUpdatesService({
      components: {
        logs: mockLogs,
        config: mockConfig,
        catalystClient: mockCatalystClient
      }
    })

    rpcContext = {
      address: '0x123',
      subscribers: {}
    }
  })

  it('should add the subscriber to the context', async () => {
    const generator = subscribeToUpdates({} as Empty, rpcContext)
    generator.next()

    expect(rpcContext.subscribers['0x123']).toBeDefined()

    // Properly clean up the generator
    generator.return(undefined)
  })

  it.todo('should yield parsed updates when an update is emitted')
  it.todo('should skip unparsable updates')
})
