import { createFriendsMockedComponent, mockLogs } from '../../../../mocks/components'
import { getMutualFriendsService } from '../../../../../src/controllers/handlers/rpc/get-mutual-friends'
import { GetMutualFriendsPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { parseExpectedFriends } from '../../../../mocks/friend'
import { IFriendsComponent } from '../../../../../src/logic/friends'

describe('when getting mutual friends', () => {
  let getMutualFriends: ReturnType<typeof getMutualFriendsService>
  let friendsComponent: IFriendsComponent
  let getMutualFriendsProfilesMethod: jest.MockedFunction<typeof friendsComponent.getMutualFriendsProfiles>

  const rpcContext: RpcServerContext = {
    address: '0x1234567890123456789012345678901234567890',
    subscribersContext: undefined
  }

  const mutualFriendsRequest: GetMutualFriendsPayload = {
    user: { address: '0x4567890123456789012345678901234567890123' },
    pagination: { limit: 10, offset: 0 }
  }

  beforeEach(() => {
    getMutualFriendsProfilesMethod = jest.fn()
    friendsComponent = createFriendsMockedComponent({
      getMutualFriendsProfiles: getMutualFriendsProfilesMethod
    })

    getMutualFriends = getMutualFriendsService({
      components: { friends: friendsComponent, logs: mockLogs }
    })
  })

  describe('and getting the users mutual friends fails', () => {
    beforeEach(() => {
      getMutualFriendsProfilesMethod.mockRejectedValue(new Error('Database error'))
    })

    it('should return an empty list', async () => {
      const response = await getMutualFriends(mutualFriendsRequest, rpcContext)

      expect(response).toEqual({
        friends: [],
        paginationData: {
          total: 0,
          page: 1
        }
      })
    })
  })

  describe('and getting the users mutual friends succeeds', () => {
    let mutualFriendsData: {
      friendsProfiles: any[]
      total: number
    }

    beforeEach(() => {
      mutualFriendsData = {
        friendsProfiles: [],
        total: 0
      }
      getMutualFriendsProfilesMethod.mockResolvedValue(mutualFriendsData)
    })

    describe('and there are no mutual friends', () => {
      beforeEach(() => {
        mutualFriendsData.friendsProfiles = []
        mutualFriendsData.total = 0
      })

      it('should return an empty list', async () => {
        const response = await getMutualFriends(mutualFriendsRequest, rpcContext)

        expect(getMutualFriendsProfilesMethod).toHaveBeenCalledWith(
          rpcContext.address,
          '0x4567890123456789012345678901234567890123',
          { limit: 10, offset: 0 }
        )
        expect(response).toEqual({
          friends: [],
          paginationData: {
            total: 0,
            page: 1
          }
        })
      })
    })

    describe('and there are multiple mutual friends', () => {
      beforeEach(() => {
        const addresses = ['0x7890123456789012345678901234567890123456', '0xabcdef012345678901234567890123456789abcd']
        const mockProfiles = addresses.map(createMockProfile)
        mutualFriendsData.friendsProfiles = mockProfiles
        mutualFriendsData.total = 2
      })

      it('should return the list of mutual friends with the pagination data for the page', async () => {
        const response = await getMutualFriends(mutualFriendsRequest, rpcContext)

        expect(getMutualFriendsProfilesMethod).toHaveBeenCalledWith(
          rpcContext.address,
          '0x4567890123456789012345678901234567890123',
          { limit: 10, offset: 0 }
        )
        expect(response).toEqual({
          friends: mutualFriendsData.friendsProfiles.map(parseExpectedFriends()),
          paginationData: {
            total: mutualFriendsData.total,
            page: 1
          }
        })
      })
    })
  })

  describe('and the user address is missing', () => {
    const requestWithoutAddress: GetMutualFriendsPayload = {
      user: undefined,
      pagination: { limit: 10, offset: 0 }
    }

    it('should return an empty list', async () => {
      const response = await getMutualFriends(requestWithoutAddress, rpcContext)

      expect(getMutualFriendsProfilesMethod).not.toHaveBeenCalled()
      expect(response).toEqual({
        friends: [],
        paginationData: {
          total: 0,
          page: 1
        }
      })
    })
  })

  describe('and the user address is invalid', () => {
    const requestWithInvalidAddress: GetMutualFriendsPayload = {
      user: { address: 'invalid-address' },
      pagination: { limit: 10, offset: 0 }
    }

    it('should return an empty list', async () => {
      const response = await getMutualFriends(requestWithInvalidAddress, rpcContext)

      expect(getMutualFriendsProfilesMethod).not.toHaveBeenCalled()
      expect(response).toEqual({
        friends: [],
        paginationData: {
          total: 0,
          page: 1
        }
      })
    })
  })
})
