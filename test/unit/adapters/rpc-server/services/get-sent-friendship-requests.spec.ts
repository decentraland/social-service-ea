import { mockDb, mockLogs } from '../../../../mocks/components'
import { getSentFriendshipRequestsService } from '../../../../../src/adapters/rpc-server/services/get-sent-friendship-requests'
import { RpcServerContext, AppComponents } from '../../../../../src/types'
import { emptyRequest } from '../../../../mocks/empty-request'
import { createMockFriendshipRequest, createMockExpectedFriendshipRequest } from '../../../../mocks/friendship-request'
import { PaginatedFriendshipRequestsResponse } from '@dcl/protocol/out-ts/decentraland/social_service/v3/social_service_v3.gen'

describe('getSentFriendshipRequestsService', () => {
  let components: jest.Mocked<Pick<AppComponents, 'db' | 'logs'>>
  let getSentRequests: ReturnType<typeof getSentFriendshipRequestsService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribers: undefined
  }

  beforeEach(() => {
    components = { db: mockDb, logs: mockLogs }
    getSentRequests = getSentFriendshipRequestsService({ components })
  })

  it('should return the correct list of sent friendship requests', async () => {
    const mockSentRequests = [
      createMockFriendshipRequest('0x456', '2025-01-01T00:00:00Z', 'Hello!'),
      createMockFriendshipRequest('0x789', '2025-01-02T00:00:00Z')
    ]

    mockDb.getSentFriendshipRequests.mockResolvedValueOnce(mockSentRequests)

    const result: PaginatedFriendshipRequestsResponse = await getSentRequests(emptyRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'requests',
        requests: {
          requests: [
            createMockExpectedFriendshipRequest('0x456', '2025-01-01T00:00:00Z', 'Hello!'),
            createMockExpectedFriendshipRequest('0x789', '2025-01-02T00:00:00Z', '')
          ]
        }
      }
    })
  })

  it('should handle database errors gracefully', async () => {
    mockDb.getSentFriendshipRequests.mockImplementationOnce(() => {
      throw new Error('Database error')
    })

    const result: PaginatedFriendshipRequestsResponse = await getSentRequests(emptyRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: {}
      }
    })
  })

  it('should map metadata.message to an empty string if undefined', async () => {
    const mockSentRequests = [createMockFriendshipRequest('0x456', '2025-01-01T00:00:00Z')]

    mockDb.getSentFriendshipRequests.mockResolvedValueOnce(mockSentRequests)

    const result: PaginatedFriendshipRequestsResponse = await getSentRequests(emptyRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'requests',
        requests: {
          requests: [createMockExpectedFriendshipRequest('0x456', '2025-01-01T00:00:00Z', '')]
        }
      }
    })
  })
})
