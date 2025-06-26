import { getFriendshipStatusService } from '../../../../../src/controllers/handlers/rpc/get-friendship-status'
import { Action, RpcServerContext, AppComponents } from '../../../../../src/types'
import {
  FriendshipStatus,
  GetFriendshipStatusPayload,
  GetFriendshipStatusResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { mockFriendsDB, mockLogs } from '../../../../mocks/components'

describe('getFriendshipStatusService', () => {
  let components: jest.Mocked<Pick<AppComponents, 'friendsDb' | 'logs'>>
  let getFriendshipStatus: ReturnType<typeof getFriendshipStatusService>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  const userAddress = '0x456'

  const mockRequest: GetFriendshipStatusPayload = {
    user: { address: userAddress }
  }

  beforeEach(() => {
    components = { friendsDb: mockFriendsDB, logs: mockLogs }
    getFriendshipStatus = getFriendshipStatusService({ components })
  })

  it('should return the friendship status for the latest action', async () => {
    const lastFriendshipAction = {
      id: 'action-id',
      friendship_id: 'friendship-id',
      acting_user: rpcContext.address,
      action: Action.REQUEST,
      timestamp: new Date().toISOString()
    }

    mockFriendsDB.getLastFriendshipActionByUsers.mockResolvedValueOnce(lastFriendshipAction)

    const result: GetFriendshipStatusResponse = await getFriendshipStatus(mockRequest, rpcContext)

    expect(mockFriendsDB.getLastFriendshipActionByUsers).toHaveBeenCalledWith('0x123', '0x456')
    expect(result).toEqual({
      response: {
        $case: 'accepted',
        accepted: {
          status: FriendshipStatus.REQUEST_SENT
        }
      }
    })
  })

  it('should return none if no friendship action is found', async () => {
    mockFriendsDB.getLastFriendshipActionByUsers.mockResolvedValueOnce(null)

    const result: GetFriendshipStatusResponse = await getFriendshipStatus(mockRequest, rpcContext)

    expect(mockFriendsDB.getLastFriendshipActionByUsers).toHaveBeenCalledWith('0x123', '0x456')
    expect(result).toEqual({
      response: {
        $case: 'accepted',
        accepted: {
          status: FriendshipStatus.NONE
        }
      }
    })
  })

  it('should handle unknown actions gracefully', async () => {
    const lastFriendshipAction = {
      id: 'action-id',
      friendship_id: 'friendship-id',
      acting_user: rpcContext.address,
      action: 'UNKNOWN_ACTION' as Action,
      timestamp: new Date().toISOString()
    }

    mockFriendsDB.getLastFriendshipActionByUsers.mockResolvedValueOnce(lastFriendshipAction)

    const result: GetFriendshipStatusResponse = await getFriendshipStatus(mockRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'accepted',
        accepted: {
          status: FriendshipStatus.UNRECOGNIZED
        }
      }
    })
  })

  it('should return internalServerError if an error occurs', async () => {
    mockFriendsDB.getLastFriendshipActionByUsers.mockImplementationOnce(() => {
      throw new Error('Database error')
    })

    const result: GetFriendshipStatusResponse = await getFriendshipStatus(mockRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: {}
      }
    })
  })
})
