import { mockDb, mockLogs } from '../../../../mocks/components'
import { getPendingFriendshipRequestsService } from '../../../../../src/adapters/rpc-server/services/get-pending-friendship-requests'
import { RpcServerContext, AppComponents } from '../../../../../src/types'
import { PaginatedFriendshipRequestsResponse } from '@dcl/protocol/out-js/decentraland/social_service/v3/social_service_v3.gen'
import { emptyRequest } from '../../../../mocks/empty-request'
import { createMockFriendshipRequest, createMockExpectedFriendshipRequest } from '../../../../mocks/friendship-request'

describe('getPendingFriendshipRequestsService', () => {
  let components: jest.Mocked<Pick<AppComponents, 'db' | 'logs'>>
  let getPendingRequests: ReturnType<typeof getPendingFriendshipRequestsService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribers: undefined
  }

  beforeEach(() => {
    components = { db: mockDb, logs: mockLogs }
    getPendingRequests = getPendingFriendshipRequestsService({ components })
  })

  it('should return the correct list of pending friendship requests', async () => {
    const mockPendingRequests = [
      createMockFriendshipRequest('id1', '0x456', '2025-01-01T00:00:00Z', 'Hi!'),
      createMockFriendshipRequest('id2', '0x789', '2025-01-02T00:00:00Z')
    ]

    mockDb.getReceivedFriendshipRequests.mockResolvedValueOnce(mockPendingRequests)

    const result: PaginatedFriendshipRequestsResponse = await getPendingRequests(emptyRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'requests',
        requests: {
          requests: [
            createMockExpectedFriendshipRequest('id1', '0x456', '2025-01-01T00:00:00Z', 'Hi!'),
            createMockExpectedFriendshipRequest('id2', '0x789', '2025-01-02T00:00:00Z')
          ]
        }
      }
    })
  })

  it('should handle database errors gracefully', async () => {
    mockDb.getReceivedFriendshipRequests.mockImplementationOnce(() => {
      throw new Error('Database error')
    })

    const result: PaginatedFriendshipRequestsResponse = await getPendingRequests(emptyRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: {}
      }
    })
  })

  it('should map metadata.message to an empty string if undefined', async () => {
    const mockPendingRequests = [createMockFriendshipRequest('id1', '0x456', '2025-01-01T00:00:00Z', 'Hi!')]

    mockDb.getReceivedFriendshipRequests.mockResolvedValueOnce(mockPendingRequests)

    const result: PaginatedFriendshipRequestsResponse = await getPendingRequests(emptyRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'requests',
        requests: {
          requests: [createMockExpectedFriendshipRequest('id1', '0x456', '2025-01-01T00:00:00Z', 'Hi!')]
        }
      }
    })
  })
})
