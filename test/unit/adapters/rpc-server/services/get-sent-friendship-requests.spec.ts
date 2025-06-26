import { mockCatalystClient, mockConfig, mockFriendsDB, mockLogs } from '../../../../mocks/components'
import { getSentFriendshipRequestsService } from '../../../../../src/controllers/handlers/rpc/get-sent-friendship-requests'
import { RpcServerContext } from '../../../../../src/types'
import { emptyRequest } from '../../../../mocks/empty-request'
import { createMockFriendshipRequest, createMockExpectedFriendshipRequest } from '../../../../mocks/friendship-request'
import { PaginatedFriendshipRequestsResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createMockProfile } from '../../../../mocks/profile'

describe('getSentFriendshipRequestsService', () => {
  let getSentRequests: ReturnType<typeof getSentFriendshipRequestsService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(async () => {
    getSentRequests = getSentFriendshipRequestsService({
      components: { friendsDb: mockFriendsDB, logs: mockLogs, catalystClient: mockCatalystClient }
    })
  })

  it('should return the correct list of sent friendship requests', async () => {
    const mockSentRequests = [
      createMockFriendshipRequest('id1', '0x456', '2025-01-01T00:00:00Z', 'Hello!'),
      createMockFriendshipRequest('id2', '0x789', '2025-01-02T00:00:00Z')
    ]
    const mockProfiles = mockSentRequests.map(({ address }) => createMockProfile(address))

    mockFriendsDB.getSentFriendshipRequests.mockResolvedValueOnce(mockSentRequests)
    mockFriendsDB.getSentFriendshipRequestsCount.mockResolvedValueOnce(mockSentRequests.length)
    mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)

    const result: PaginatedFriendshipRequestsResponse = await getSentRequests(emptyRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'requests',
        requests: {
          requests: [
            createMockExpectedFriendshipRequest('id1', '0x456', mockProfiles[0], '2025-01-01T00:00:00Z', 'Hello!'),
            createMockExpectedFriendshipRequest('id2', '0x789', mockProfiles[1], '2025-01-02T00:00:00Z')
          ]
        }
      },
      paginationData: {
        total: mockSentRequests.length,
        page: 1
      }
    })
  })

  it.each([
    ['getSentFriendshipRequests', mockFriendsDB.getSentFriendshipRequests],
    ['getSentFriendshipRequestsCount', mockFriendsDB.getSentFriendshipRequestsCount]
  ])('should handle database errors in the %s method gracefully', async (_methodName, method) => {
    method.mockImplementationOnce(() => {
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
    const mockSentRequests = [createMockFriendshipRequest('id1', '0x456', '2025-01-01T00:00:00Z')]
    const mockProfiles = mockSentRequests.map(({ address }) => createMockProfile(address))

    mockFriendsDB.getSentFriendshipRequests.mockResolvedValueOnce(mockSentRequests)
    mockFriendsDB.getSentFriendshipRequestsCount.mockResolvedValueOnce(mockSentRequests.length)
    mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)

    const result: PaginatedFriendshipRequestsResponse = await getSentRequests(emptyRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'requests',
        requests: {
          requests: [createMockExpectedFriendshipRequest('id1', '0x456', mockProfiles[0], '2025-01-01T00:00:00Z')]
        }
      },
      paginationData: {
        total: mockSentRequests.length,
        page: 1
      }
    })
  })
})
