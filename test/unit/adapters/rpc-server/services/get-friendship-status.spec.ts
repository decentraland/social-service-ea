import { createFriendsMockedComponent, mockLogs } from '../../../../mocks/components'
import { getFriendshipStatusService } from '../../../../../src/controllers/handlers/rpc/get-friendship-status'
import { RpcServerContext } from '../../../../../src/types'
import {
  FriendshipStatus,
  GetFriendshipStatusPayload
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { IFriendsComponent } from '../../../../../src/logic/friends'

describe('when getting friendship status', () => {
  let getFriendshipStatus: ReturnType<typeof getFriendshipStatusService>
  let friendsComponent: IFriendsComponent
  let getFriendshipStatusMethod: jest.MockedFunction<typeof friendsComponent.getFriendshipStatus>

  const rpcContext: RpcServerContext = {
    address: '0x1234567890123456789012345678901234567890',
    subscribersContext: undefined
  }

  const userAddress = '0x4564567890123456789012345678901234567890'

  const mockRequest: GetFriendshipStatusPayload = {
    user: { address: userAddress }
  }

  beforeEach(() => {
    getFriendshipStatusMethod = jest.fn()
    friendsComponent = createFriendsMockedComponent({
      getFriendshipStatus: getFriendshipStatusMethod
    })

    getFriendshipStatus = getFriendshipStatusService({
      components: { friends: friendsComponent, logs: mockLogs }
    })
  })

  describe('and getting the users friendship status fails', () => {
    beforeEach(() => {
      getFriendshipStatusMethod.mockRejectedValue(new Error('Database error'))
    })

    it('should return internal server error', async () => {
      const response = await getFriendshipStatus(mockRequest, rpcContext)

      expect(getFriendshipStatusMethod).toHaveBeenCalledWith(rpcContext.address, userAddress)
      expect(response).toEqual({
        response: {
          $case: 'internalServerError',
          internalServerError: {
            message: 'Database error'
          }
        }
      })
    })
  })

  describe('and getting the users friendship status succeeds', () => {
    beforeEach(() => {
      getFriendshipStatusMethod.mockResolvedValue(FriendshipStatus.REQUEST_SENT)
    })

    it('should return the friendship status', async () => {
      const response = await getFriendshipStatus(mockRequest, rpcContext)

      expect(getFriendshipStatusMethod).toHaveBeenCalledWith(rpcContext.address, userAddress)
      expect(response).toEqual({
        response: {
          $case: 'accepted',
          accepted: {
            status: FriendshipStatus.REQUEST_SENT
          }
        }
      })
    })
  })

  describe('and the user address is missing', () => {
    const requestWithoutAddress: GetFriendshipStatusPayload = {
      user: undefined
    }

    it('should return internal server error', async () => {
      const response = await getFriendshipStatus(requestWithoutAddress, rpcContext)

      expect(getFriendshipStatusMethod).not.toHaveBeenCalled()
      expect(response).toEqual({
        response: {
          $case: 'internalServerError',
          internalServerError: {
            message: 'User address is missing in the request payload'
          }
        }
      })
    })
  })

  describe('and the user address is invalid', () => {
    const requestWithInvalidAddress: GetFriendshipStatusPayload = {
      user: { address: 'invalid-address' }
    }

    it('should return internal server error', async () => {
      const response = await getFriendshipStatus(requestWithInvalidAddress, rpcContext)

      expect(getFriendshipStatusMethod).not.toHaveBeenCalled()
      expect(response).toEqual({
        response: {
          $case: 'internalServerError',
          internalServerError: {
            message: 'Invalid user address in the request payload'
          }
        }
      })
    })
  })

  describe('and there is no friendship action', () => {
    beforeEach(() => {
      getFriendshipStatusMethod.mockResolvedValue(FriendshipStatus.NONE)
    })

    it('should return NONE status', async () => {
      const response = await getFriendshipStatus(mockRequest, rpcContext)

      expect(getFriendshipStatusMethod).toHaveBeenCalledWith(rpcContext.address, userAddress)
      expect(response).toEqual({
        response: {
          $case: 'accepted',
          accepted: {
            status: FriendshipStatus.NONE
          }
        }
      })
    })
  })

  describe('and there is an unknown action', () => {
    beforeEach(() => {
      getFriendshipStatusMethod.mockResolvedValue(FriendshipStatus.UNRECOGNIZED)
    })

    it('should return UNRECOGNIZED status', async () => {
      const response = await getFriendshipStatus(mockRequest, rpcContext)

      expect(getFriendshipStatusMethod).toHaveBeenCalledWith(rpcContext.address, userAddress)
      expect(response).toEqual({
        response: {
          $case: 'accepted',
          accepted: {
            status: FriendshipStatus.UNRECOGNIZED
          }
        }
      })
    })
  })
})
