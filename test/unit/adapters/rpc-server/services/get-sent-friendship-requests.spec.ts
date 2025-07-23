import { createFriendsMockedComponent, mockLogs } from '../../../../mocks/components'
import { getSentFriendshipRequestsService } from '../../../../../src/controllers/handlers/rpc/get-sent-friendship-requests'
import { RpcServerContext } from '../../../../../src/types'
import { emptyRequest } from '../../../../mocks/empty-request'
import { createMockExpectedFriendshipRequest } from '../../../../mocks/friendship-request'
import { PaginatedFriendshipRequestsResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createMockProfile } from '../../../../mocks/profile'
import { IFriendsComponent } from '../../../../../src/logic/friends'
import { FriendshipRequest } from '../../../../../src/types'

describe('Get Sent Friendship Requests Service', () => {
  let getSentRequests: ReturnType<typeof getSentFriendshipRequestsService>
  let friendsComponent: IFriendsComponent
  let getSentFriendshipRequestsMethod: jest.MockedFunction<typeof friendsComponent.getSentFriendshipRequests>

  const rpcContext: RpcServerContext = {
    address: '0x1234567890123456789012345678901234567890',
    subscribersContext: undefined
  }

  beforeEach(() => {
    getSentFriendshipRequestsMethod = jest.fn()
    friendsComponent = createFriendsMockedComponent({
      getSentFriendshipRequests: getSentFriendshipRequestsMethod
    })

    getSentRequests = getSentFriendshipRequestsService({
      components: { friends: friendsComponent, logs: mockLogs }
    })
  })

  describe('when getting the users sent friendship requests fails', () => {
    beforeEach(() => {
      getSentFriendshipRequestsMethod.mockRejectedValue(new Error('Database error'))
    })

    it('should return internal server error', async () => {
      const response = await getSentRequests(emptyRequest, rpcContext)

      expect(response).toEqual({
        response: {
          $case: 'internalServerError',
          internalServerError: {}
        }
      })
    })
  })

  describe('when getting the users sent friendship requests succeeds', () => {
    let sentRequestsData: {
      requests: FriendshipRequest[]
      profiles: any[]
      total: number
    }

    beforeEach(() => {
      sentRequestsData = {
        requests: [],
        profiles: [],
        total: 0
      }
      getSentFriendshipRequestsMethod.mockResolvedValue(sentRequestsData)
    })

    describe('and there are no sent requests', () => {
      beforeEach(() => {
        sentRequestsData.requests = []
        sentRequestsData.total = 0
      })

      it('should return empty requests array', async () => {
        const response = await getSentRequests(emptyRequest, rpcContext)

        expect(getSentFriendshipRequestsMethod).toHaveBeenCalledWith(rpcContext.address, undefined)
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

    describe('and there are multiple sent requests', () => {
      beforeEach(() => {
        const mockProfiles = [
          createMockProfile('0x4567890123456789012345678901234567890123'),
          createMockProfile('0x7890123456789012345678901234567890123456')
        ]
        sentRequestsData.requests = [
          {
            id: 'id1',
            address: '0x4567890123456789012345678901234567890123',
            timestamp: '2025-01-01T00:00:00Z',
            metadata: { message: 'Hello!' }
          },
          {
            id: 'id2',
            address: '0x7890123456789012345678901234567890123456',
            timestamp: '2025-01-02T00:00:00Z',
            metadata: null
          }
        ]
        sentRequestsData.profiles = mockProfiles
        sentRequestsData.total = 2
      })

      it('should return the list of sent requests with the pagination data for the page', async () => {
        const response = await getSentRequests(emptyRequest, rpcContext)

        expect(getSentFriendshipRequestsMethod).toHaveBeenCalledWith(rpcContext.address, undefined)
        expect(response).toEqual({
          response: {
            $case: 'requests',
            requests: {
              requests: [
                createMockExpectedFriendshipRequest(
                  'id1',
                  '0x4567890123456789012345678901234567890123',
                  sentRequestsData.profiles[0],
                  '2025-01-01T00:00:00Z',
                  'Hello!'
                ),
                createMockExpectedFriendshipRequest(
                  'id2',
                  '0x7890123456789012345678901234567890123456',
                  sentRequestsData.profiles[1],
                  '2025-01-02T00:00:00Z'
                )
              ]
            }
          },
          paginationData: {
            total: sentRequestsData.total,
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
        sentRequestsData.requests = [
          {
            id: 'id1',
            address: '0x4567890123456789012345678901234567890123',
            timestamp: '2025-01-01T00:00:00Z',
            metadata: { message: 'Hello!' }
          }
        ]
        sentRequestsData.profiles = mockProfiles
        sentRequestsData.total = 1
      })

      it('should use the provided pagination', async () => {
        const response = await getSentRequests(requestWithPagination, rpcContext)

        expect(getSentFriendshipRequestsMethod).toHaveBeenCalledWith(
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
                  sentRequestsData.profiles[0],
                  '2025-01-01T00:00:00Z',
                  'Hello!'
                )
              ]
            }
          },
          paginationData: {
            total: sentRequestsData.total,
            page: 3
          }
        })
      })
    })
  })
})
