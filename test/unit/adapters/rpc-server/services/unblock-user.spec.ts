import {
  createFriendsMockedComponent,
  mockCatalystClient,
  mockFriendsDB,
  mockLogs,
  mockPg,
  mockPubSub
} from '../../../../mocks/components'
import { unblockUserService } from '../../../../../src/controllers/handlers/rpc/unblock-user'
import { UnblockUserPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Action, Friendship, RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { PoolClient } from 'pg'
import { IFriendsComponent, parseProfileToBlockedUser } from '../../../../../src/logic/friends'
import { BLOCK_UPDATES_CHANNEL, FRIENDSHIP_UPDATES_CHANNEL } from '../../../../../src/adapters/pubsub'
import { EthAddress } from '@dcl/schemas'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { ProfileNotFoundError } from '../../../../../src/logic/friends/errors'

describe('when unblocking a user', () => {
  let unblockUser: ReturnType<typeof unblockUserService>
  let friends: jest.Mocked<IFriendsComponent>
  let blockedAddress: EthAddress
  let mockProfile: Profile
  let rpcContext: RpcServerContext
  let userAddress: EthAddress

  beforeEach(async () => {
    userAddress = '0x123'
    rpcContext = {
      address: userAddress,
      subscribersContext: undefined
    }

    friends = createFriendsMockedComponent({
      unblockUser: jest.fn()
    })

    unblockUser = unblockUserService({
      components: { friends, logs: mockLogs }
    })

    blockedAddress = '0x12356abC4078a0Cc3b89b419928b857B8AF826ef'
    mockProfile = createMockProfile(blockedAddress)
  })

  describe('and the blocker address is the same as the blocked address', () => {
    it('should return an invalidRequest error', async () => {
      const response = await unblockUser({ user: { address: userAddress } }, rpcContext)

      expect(response).toEqual({
        response: {
          $case: 'invalidRequest',
          invalidRequest: { message: 'Cannot unblock yourself' }
        }
      })
    })
  })

  describe('and the address to unblock is invalid', () => {
    it('should return an invalidRequest error', async () => {
      const response = await unblockUser({ user: { address: 'invalid-address' } }, rpcContext)

      expect(response).toEqual({
        response: {
          $case: 'invalidRequest',
          invalidRequest: { message: 'Invalid user address in the request payload' }
        }
      })
    })
  })

  describe('and the unblocked user profile is not found', () => {
    beforeEach(() => {
      friends.unblockUser.mockRejectedValueOnce(new ProfileNotFoundError(blockedAddress))
    })

    it('should return a profileNotFound error', async () => {
      const response = await unblockUser({ user: { address: blockedAddress } }, rpcContext)

      expect(response).toEqual({
        response: {
          $case: 'profileNotFound',
          profileNotFound: { message: `Profile not found for address ${blockedAddress}` }
        }
      })
    })
  })

  describe('and unblocking the user fails', () => {
    beforeEach(() => {
      friends.unblockUser.mockRejectedValueOnce(new Error('Unblock user failed'))
    })

    it('should return an internal server error with the error message', async () => {
      const response = await unblockUser({ user: { address: blockedAddress } }, rpcContext)

      expect(response).toEqual({
        response: {
          $case: 'internalServerError',
          internalServerError: { message: 'Unblock user failed' }
        }
      })
    })
  })

  describe('and unblocking the user succeeds', () => {
    beforeEach(() => {
      friends.unblockUser.mockResolvedValueOnce(mockProfile)
    })

    it('should return an ok response with the unblocked user profile', async () => {
      const response = await unblockUser({ user: { address: blockedAddress } }, rpcContext)

      expect(response).toEqual({
        response: {
          $case: 'ok',
          ok: { profile: parseProfileToBlockedUser(mockProfile) }
        }
      })
    })
  })
})
