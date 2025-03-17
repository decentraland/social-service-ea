import { mockDb, mockLogs } from '../../../../mocks/components'
import { RpcServerContext } from '../../../../../src/types'
import { getBlockingStatusService } from '../../../../../src/adapters/rpc-server/services/get-blocking-status'

describe('getBlockingStatusService', () => {
  let getBlockingStatus: ReturnType<typeof getBlockingStatusService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(() => {
    getBlockingStatus = getBlockingStatusService({
      components: { db: mockDb, logs: mockLogs }
    })
  })

  it('should return blocked users and blocked by users addresses', async () => {
    const blockedUsers = [{ address: '0x456', blocked_at: new Date() }, { address: '0x789', blocked_at: new Date() }]
    const blockedByUsers = [{ address: '0x123', blocked_at: new Date() }, { address: '0x456', blocked_at: new Date() }]

    mockDb.getBlockedUsers.mockResolvedValueOnce(blockedUsers)
    mockDb.getBlockedByUsers.mockResolvedValueOnce(blockedByUsers)
    const response = await getBlockingStatus({}, rpcContext)

    expect(response).toEqual({
      blockedUsers: blockedUsers.map((user) => user.address),
      blockedByUsers: blockedByUsers.map((user) => user.address)
    })
  })

  it('should handle errors in the getBlockedUsers db call gracefully', async () => {
    const error = new Error('Database error')

    mockDb.getBlockedUsers.mockRejectedValueOnce(error)

    const response = await getBlockingStatus({}, rpcContext)

    expect(response).toEqual({
      blockedUsers: [],
      blockedByUsers: []
    })
  })

  it('should handle errors in the getBlockedByUsers db call gracefully', async () => {
    const error = new Error('Database error')

    mockDb.getBlockedByUsers.mockRejectedValueOnce(error)

    const response = await getBlockingStatus({}, rpcContext)

    expect(response).toEqual({
      blockedUsers: [],
      blockedByUsers: []
    })
  })
})
