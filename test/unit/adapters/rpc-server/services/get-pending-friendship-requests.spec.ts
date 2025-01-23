import { mockCatalystClient, mockConfig, mockDb, mockLogs } from '../../../../mocks/components'
import { getPendingFriendshipRequestsService } from '../../../../../src/adapters/rpc-server/services/get-pending-friendship-requests'
import { RpcServerContext } from '../../../../../src/types'
import { PaginatedFriendshipRequestsResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { emptyRequest } from '../../../../mocks/empty-request'
import { createMockFriendshipRequest, createMockExpectedFriendshipRequest } from '../../../../mocks/friendship-request'
import { createMockProfile, PROFILE_IMAGES_URL } from '../../../../mocks/profile'

describe('getPendingFriendshipRequestsService', () => {
  let getPendingRequests: Awaited<ReturnType<typeof getPendingFriendshipRequestsService>>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribers: undefined
  }

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValueOnce(PROFILE_IMAGES_URL)

    getPendingRequests = await getPendingFriendshipRequestsService({
      components: { db: mockDb, logs: mockLogs, config: mockConfig, catalystClient: mockCatalystClient }
    })
  })

  it('should return the correct list of pending friendship requests', async () => {
    const mockPendingRequests = [
      createMockFriendshipRequest('id1', '0x456', '2025-01-01T00:00:00Z', 'Hi!'),
      createMockFriendshipRequest('id2', '0x789', '2025-01-02T00:00:00Z')
    ]
    const mockProfiles = mockPendingRequests.map(({ address }) => createMockProfile(address))

    mockDb.getReceivedFriendshipRequests.mockResolvedValueOnce(mockPendingRequests)
    mockCatalystClient.getEntitiesByPointers.mockResolvedValueOnce(mockProfiles)
    const result: PaginatedFriendshipRequestsResponse = await getPendingRequests(emptyRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'requests',
        requests: {
          requests: [
            createMockExpectedFriendshipRequest('id1', '0x456', mockProfiles[0], '2025-01-01T00:00:00Z', 'Hi!'),
            createMockExpectedFriendshipRequest('id2', '0x789', mockProfiles[1], '2025-01-02T00:00:00Z')
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
    const mockPendingRequests = [createMockFriendshipRequest('id1', '0x456', '2025-01-01T00:00:00Z')]
    const mockProfiles = mockPendingRequests.map(({ address }) => createMockProfile(address))

    mockDb.getReceivedFriendshipRequests.mockResolvedValueOnce(mockPendingRequests)
    mockCatalystClient.getEntitiesByPointers.mockResolvedValueOnce(mockProfiles)

    const result: PaginatedFriendshipRequestsResponse = await getPendingRequests(emptyRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'requests',
        requests: {
          requests: [createMockExpectedFriendshipRequest('id1', '0x456', mockProfiles[0], '2025-01-01T00:00:00Z', '')]
        }
      }
    })
  })
})
