import { EthAddress } from '@dcl/schemas'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { createFriendsMockedComponent, mockLogs } from '../../../../mocks/components'
import { blockUserService } from '../../../../../src/controllers/handlers/rpc/block-user'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { parseProfileToBlockedUser } from '../../../../../src/logic/friends'
import { ProfileNotFoundError } from '../../../../../src/logic/friends/errors'

describe('when blocking a user', () => {
  let blockUser: ReturnType<typeof blockUserService>
  let mockFriendsComponent: jest.Mocked<ReturnType<typeof createFriendsMockedComponent>>
  let mockBlockUser: jest.MockedFunction<typeof mockFriendsComponent.blockUser>
  let blockedAddress: EthAddress
  let userAddress: EthAddress

  let rpcContext: RpcServerContext

  beforeEach(async () => {
    userAddress = '0x123'
    blockedAddress = '0x12356abC4078a0Cc3b89b419928b857B8AF826ef'
    rpcContext = {
      address: userAddress,
      subscribersContext: undefined
    }
    mockBlockUser = jest.fn()
    mockFriendsComponent = createFriendsMockedComponent({
      blockUser: mockBlockUser
    })
    blockUser = blockUserService({
      components: { friends: mockFriendsComponent, logs: mockLogs }
    })
  })

  describe('and blocking the user fails with a ProfileNotFoundError', () => {
    beforeEach(() => {
      mockBlockUser.mockRejectedValue(new ProfileNotFoundError(blockedAddress))
    })

    it('should return a profileNotFound error', async () => {
      const result = await blockUser({ user: { address: blockedAddress } }, rpcContext)

      expect(result).toEqual({
        response: {
          $case: 'profileNotFound',
          profileNotFound: {
            message: `Profile not found for address ${blockedAddress}`
          }
        }
      })
    })
  })

  describe('and the user is the same as the blocked user', () => {
    it('should return an invalidRequest error', async () => {
      const result = await blockUser({ user: { address: userAddress } }, rpcContext)

      expect(result).toEqual({
        response: { $case: 'invalidRequest', invalidRequest: { message: 'Cannot block yourself' } }
      })
    })
  })

  describe('and the user to block is not a valid address', () => {
    it('should return an invalidRequest error', async () => {
      const result = await blockUser({ user: { address: 'an-invalid-address' } }, rpcContext)

      expect(result).toEqual({
        response: {
          $case: 'invalidRequest',
          invalidRequest: { message: 'Invalid user address in the request payload' }
        }
      })
    })
  })

  describe('and blocking the user succeeds', () => {
    let mockedProfile: Profile
    let blockedAt: Date

    beforeEach(() => {
      mockedProfile = createMockProfile(blockedAddress)
      blockedAt = new Date()
      mockBlockUser.mockResolvedValue({ profile: mockedProfile, blockedAt })
    })

    it('should return an ok response with the blocked user profile and the blockedAt date', async () => {
      const result = await blockUser({ user: { address: blockedAddress } }, rpcContext)

      expect(result).toEqual({
        response: { $case: 'ok', ok: { profile: parseProfileToBlockedUser(mockedProfile, blockedAt) } }
      })
    })
  })
})
