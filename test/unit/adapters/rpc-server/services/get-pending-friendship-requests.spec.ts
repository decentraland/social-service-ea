import { createFriendsMockedComponent, mockLogs } from '../../../../mocks/components'
import { getPendingFriendshipRequestsService } from '../../../../../src/controllers/handlers/rpc/get-pending-friendship-requests'
import { RpcServerContext } from '../../../../../src/types'
import { PaginatedFriendshipRequestsResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { emptyRequest } from '../../../../mocks/empty-request'
import { createMockExpectedFriendshipRequest } from '../../../../mocks/friendship-request'
import { createMockProfile } from '../../../../mocks/profile'
import { IFriendsComponent } from '../../../../../src/logic/friends'
import { FriendshipRequest } from '../../../../../src/types'

describe('Get Pending Friendship Requests Service', () => {
  let getPendingRequests: ReturnType<typeof getPendingFriendshipRequestsService>
  let friendsComponent: IFriendsComponent
  let getPendingFriendshipRequestsMethod: jest.MockedFunction<typeof friendsComponent.getPendingFriendshipRequests>

  const rpcContext: RpcServerContext = {
    address: '0x1234567890123456789012345678901234567890',
    subscribersContext: undefined
  }

  beforeEach(() => {
    getPendingFriendshipRequestsMethod = jest.fn()
    friendsComponent = createFriendsMockedComponent({
      getPendingFriendshipRequests: getPendingFriendshipRequestsMethod
    })

    getPendingRequests = getPendingFriendshipRequestsService({
      components: { friends: friendsComponent, logs: mockLogs }
    })
  })

  describe('when getting the users pending friendship requests fails', () => {
    beforeEach(() => {
      getPendingFriendshipRequestsMethod.mockRejectedValue(new Error('Database error'))
    })

    it('should return internal server error', async () => {
      const response = await getPendingRequests(emptyRequest, rpcContext)

      expect(response).toEqual({
        response: {
          $case: 'internalServerError',
          internalServerError: {}
        }
      })
    })
  })

  describe('when getting the users pending friendship requests succeeds', () => {
    let pendingRequestsData: {
      requests: FriendshipRequest[]
      profiles: any[]
      total: number
    }

    beforeEach(() => {
      pendingRequestsData = {
        requests: [],
        profiles: [],
        total: 0
      }
      getPendingFriendshipRequestsMethod.mockResolvedValue(pendingRequestsData)
    })

    describe('and there are no pending requests', () => {
      beforeEach(() => {
        pendingRequestsData.requests = []
        pendingRequestsData.total = 0
      })

      it('should return empty requests array', async () => {
        const response = await getPendingRequests(emptyRequest, rpcContext)

        expect(getPendingFriendshipRequestsMethod).toHaveBeenCalledWith(rpcContext.address, undefined)
        expect(response).toEqual({
          response: {
            $case: 'requests',
            requests: {
              requests: []
            }
          },
          paginationData: {
            total: 0,
            page: 1
          }
        })
      })
    })

    describe('and there are multiple pending requests', () => {
      beforeEach(() => {
        const mockProfiles = [
          createMockProfile('0x4567890123456789012345678901234567890123'),
          createMockProfile('0x7890123456789012345678901234567890123456')
        ]
        pendingRequestsData.requests = [
          {
            id: 'id1',
            address: '0x4567890123456789012345678901234567890123',
            timestamp: '2025-01-01T00:00:00Z',
            metadata: { message: 'Hi!' }
          },
          {
            id: 'id2',
            address: '0x7890123456789012345678901234567890123456',
            timestamp: '2025-01-02T00:00:00Z',
            metadata: null
          }
        ]
        pendingRequestsData.profiles = mockProfiles
        pendingRequestsData.total = 2
      })

      it('should return the list of pending requests with the pagination data for the page', async () => {
        const response = await getPendingRequests(emptyRequest, rpcContext)

        expect(getPendingFriendshipRequestsMethod).toHaveBeenCalledWith(rpcContext.address, undefined)
        expect(response).toEqual({
          response: {
            $case: 'requests',
            requests: {
              requests: [
                createMockExpectedFriendshipRequest(
                  'id1',
                  '0x4567890123456789012345678901234567890123',
                  pendingRequestsData.profiles[0],
                  '2025-01-01T00:00:00Z',
                  'Hi!'
                ),
                createMockExpectedFriendshipRequest(
                  'id2',
                  '0x7890123456789012345678901234567890123456',
                  pendingRequestsData.profiles[1],
                  '2025-01-02T00:00:00Z'
                )
              ]
            }
          },
          paginationData: {
            total: pendingRequestsData.total,
            page: 1
          }
        })
      })
    })

    describe('and there is pagination provided', () => {
      const requestWithPagination = {
        pagination: { limit: 5, offset: 10 }
      }

      beforeEach(() => {
        const mockProfiles = [createMockProfile('0x4567890123456789012345678901234567890123')]
        pendingRequestsData.requests = [
          {
            id: 'id1',
            address: '0x4567890123456789012345678901234567890123',
            timestamp: '2025-01-01T00:00:00Z',
            metadata: { message: 'Hi!' }
          }
        ]
        pendingRequestsData.profiles = mockProfiles
        pendingRequestsData.total = 1
      })

      it('should use the provided pagination', async () => {
        const response = await getPendingRequests(requestWithPagination, rpcContext)

        expect(getPendingFriendshipRequestsMethod).toHaveBeenCalledWith(
          rpcContext.address,
          requestWithPagination.pagination
        )
        expect(response).toEqual({
          response: {
            $case: 'requests',
            requests: {
              requests: [
                createMockExpectedFriendshipRequest(
                  'id1',
                  '0x4567890123456789012345678901234567890123',
                  pendingRequestsData.profiles[0],
                  '2025-01-01T00:00:00Z',
                  'Hi!'
                )
              ]
            }
          },
          paginationData: {
            total: pendingRequestsData.total,
            page: 3
          }
        })
      })
    })
  })
})
