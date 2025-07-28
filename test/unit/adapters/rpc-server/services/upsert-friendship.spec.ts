import {
  UpsertFriendshipPayload,
  UpsertFriendshipResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { createFriendsMockedComponent, mockLogs } from '../../../../mocks/components'
import { upsertFriendshipService } from '../../../../../src/controllers/handlers/rpc/upsert-friendship'
import { FriendshipRequest, RpcServerContext } from '../../../../../src/types'
import { IFriendsComponent, parseFriendshipRequestToFriendshipRequestResponse } from '../../../../../src/logic/friends'
import { createMockProfile } from '../../../../mocks/profile'
import { InvalidFriendshipActionError, InvalidRequestError } from '../../../../../src/controllers/errors/rpc.errors'
import { BlockedUserError } from '../../../../../src/logic/friends/errors'

describe('when upserting a friendship', () => {
  let upsertFriendship: ReturnType<typeof upsertFriendshipService>
  let upsertFriendshipMock: jest.MockedFunction<IFriendsComponent['upsertFriendship']>
  let mockRequest: UpsertFriendshipPayload
  let rpcContext: RpcServerContext
  let userAddress: string
  let receiverAddress: string
  let message: string

  beforeEach(async () => {
    userAddress = '0x456'
    receiverAddress = '0x5577E5574C7ceE353A8441e7BdF52033E1E08EAD'
    message = 'Hello'
    rpcContext = { address: userAddress, subscribersContext: undefined }
    upsertFriendshipMock = jest.fn()

    upsertFriendship = upsertFriendshipService({
      components: {
        logs: mockLogs,
        friends: createFriendsMockedComponent({
          upsertFriendship: upsertFriendshipMock
        })
      }
    })
  })

  describe("and the request can't be parsed", () => {
    beforeEach(() => {
      mockRequest = {
        action: {
          $case: 'unknown',
          unknown: {}
        } as any
      }
    })

    it('should return an invalid request error', async () => {
      const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

      expect(result).toEqual({
        response: {
          $case: 'invalidRequest',
          invalidRequest: { message: 'Unknown message' }
        }
      })
    })
  })

  describe('and the request is of request type and the user is the same as the logged user', () => {
    beforeEach(() => {
      mockRequest = {
        action: {
          $case: 'request',
          request: { user: { address: userAddress }, message }
        }
      }
    })

    it('should return an invalid friendship action error', async () => {
      const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

      expect(result).toEqual({
        response: {
          $case: 'invalidFriendshipAction',
          invalidFriendshipAction: { message: 'You cannot send a friendship request to yourself' }
        }
      })
    })
  })

  describe('and upserting the friendship fails with a blocked user error', () => {
    beforeEach(() => {
      mockRequest = {
        action: {
          $case: 'request',
          request: { user: { address: receiverAddress }, message }
        }
      }
      upsertFriendshipMock.mockRejectedValueOnce(new BlockedUserError())
    })

    it('should return an invalid friendship action error', async () => {
      const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

      expect(result).toEqual({
        response: {
          $case: 'invalidFriendshipAction',
          invalidFriendshipAction: {
            message: 'This action is not allowed because either you blocked this user or this user blocked you'
          }
        }
      })
    })
  })

  describe('and upserting the friendship fails with an invalid friendship action error', () => {
    beforeEach(() => {
      mockRequest = {
        action: {
          $case: 'request',
          request: { user: { address: receiverAddress }, message }
        }
      }
      upsertFriendshipMock.mockRejectedValueOnce(new InvalidFriendshipActionError('An error'))
    })

    it('should return an invalid friendship action error', async () => {
      const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

      expect(result).toEqual({
        response: {
          $case: 'invalidFriendshipAction',
          invalidFriendshipAction: { message: 'An error' }
        }
      })
    })
  })

  describe('and upserting the friendship fails with an unknown error', () => {
    beforeEach(() => {
      mockRequest = {
        action: {
          $case: 'request',
          request: { user: { address: receiverAddress }, message }
        }
      }
      upsertFriendshipMock.mockRejectedValueOnce(new Error('An error'))
    })

    it('should return an internal server error', async () => {
      const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

      expect(result).toEqual({
        response: {
          $case: 'internalServerError',
          internalServerError: { message: 'An error' }
        }
      })
    })
  })

  describe('and upserting the friendship fails with an invalid user address error', () => {
    beforeEach(() => {
      mockRequest = {
        action: {
          $case: 'request',
          request: { user: { address: 'invalid' }, message }
        }
      }
      upsertFriendshipMock.mockRejectedValueOnce(new InvalidRequestError('Invalid user address in the request payload'))
    })

    it('should return an invalid request error', async () => {
      const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

      expect(result).toEqual({
        response: {
          $case: 'invalidRequest',
          invalidRequest: { message: 'Invalid user address in the request payload' }
        }
      })
    })
  })

  describe('and upserting the friendship succeeds', () => {
    let mockFriendshipRequest: FriendshipRequest
    let receiverProfile: Profile

    beforeEach(() => {
      mockRequest = {
        action: {
          $case: 'request',
          request: { user: { address: receiverAddress }, message }
        }
      }
      mockFriendshipRequest = {
        id: '1',
        address: receiverAddress,
        timestamp: Date.now().toString(),
        metadata: { message }
      }
      receiverProfile = createMockProfile(receiverAddress)
      upsertFriendshipMock.mockResolvedValueOnce({
        friendshipRequest: mockFriendshipRequest,
        receiverProfile
      })
    })

    it('should return an accepted friendship request', async () => {
      const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

      expect(result).toEqual({
        response: {
          $case: 'accepted',
          accepted: parseFriendshipRequestToFriendshipRequestResponse(mockFriendshipRequest, receiverProfile)
        }
      })
    })
  })
})
