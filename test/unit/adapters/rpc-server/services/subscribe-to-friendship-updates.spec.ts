import { subscribeToFriendshipUpdatesService } from '../../../../../src/adapters/rpc-server/services/subscribe-to-friendship-updates'
import { Empty } from '@dcl/protocol/out-ts/google/protobuf/empty.gen'
import { RpcServerContext, AppComponents } from '../../../../../src/types'
import { mockLogs } from '../../../../mocks/components'

describe('subscribeToFriendshipUpdatesService', () => {
  let components: Pick<AppComponents, 'logs'>
  let subscribeToUpdates: ReturnType<typeof subscribeToFriendshipUpdatesService>
  let rpcContext: RpcServerContext

  beforeEach(() => {
    components = { logs: mockLogs }
    subscribeToUpdates = subscribeToFriendshipUpdatesService({ components })

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
