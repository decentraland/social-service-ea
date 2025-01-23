import { mockCatalystClient, mockConfig, mockDb, mockLogs } from '../../../../mocks/components'
import { getSentFriendshipRequestsService } from '../../../../../src/adapters/rpc-server/services/get-sent-friendship-requests'
import { RpcServerContext } from '../../../../../src/types'
import { emptyRequest } from '../../../../mocks/empty-request'
import { createMockFriendshipRequest, createMockExpectedFriendshipRequest } from '../../../../mocks/friendship-request'
import { PaginatedFriendshipRequestsResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createMockProfile } from '../../../../mocks/profile'

describe('getSentFriendshipRequestsService', () => {
  let getSentRequests: Awaited<ReturnType<typeof getSentFriendshipRequestsService>>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribers: undefined
  }

  const profileImagesUrl = 'https://profile-images.decentraland.org'

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValueOnce(profileImagesUrl)
    getSentRequests = await getSentFriendshipRequestsService({
      components: { db: mockDb, logs: mockLogs, config: mockConfig, catalystClient: mockCatalystClient }
    })
  })

  it('should return the correct list of sent friendship requests', async () => {
    const mockSentRequests = [
      createMockFriendshipRequest('id1', '0x456', '2025-01-01T00:00:00Z', 'Hello!'),
      createMockFriendshipRequest('id2', '0x789', '2025-01-02T00:00:00Z')
    ]
    const mockProfiles = mockSentRequests.map(({ address }) => createMockProfile(address))

    mockDb.getSentFriendshipRequests.mockResolvedValueOnce(mockSentRequests)
    mockCatalystClient.getEntitiesByPointers.mockResolvedValueOnce(mockProfiles)

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
    const mockSentRequests = [createMockFriendshipRequest('id1', '0x456', '2025-01-01T00:00:00Z')]
    const mockProfiles = mockSentRequests.map(({ address }) => createMockProfile(address))

    mockDb.getSentFriendshipRequests.mockResolvedValueOnce(mockSentRequests)
    mockCatalystClient.getEntitiesByPointers.mockResolvedValueOnce(mockProfiles)

    const result: PaginatedFriendshipRequestsResponse = await getSentRequests(emptyRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'requests',
        requests: {
          requests: [createMockExpectedFriendshipRequest('id1', '0x456', mockProfiles[0], '2025-01-01T00:00:00Z')]
        }
      }
    })
  })
})
