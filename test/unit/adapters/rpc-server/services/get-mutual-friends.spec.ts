import { createFriendsMockedComponent, mockLogs } from '../../../../mocks/components'
import { getMutualFriendsService } from '../../../../../src/controllers/handlers/rpc/get-mutual-friends'
import { GetMutualFriendsPayload } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { createMockFriend, parseExpectedFriends } from '../../../../mocks/friend'
import { IFriendsComponent } from '../../../../../src/logic/friends'

describe('Get Mutual Friends Service', () => {
  let getMutualFriends: ReturnType<typeof getMutualFriendsService>
  let friendsComponent: IFriendsComponent
  let getMutualFriendsMethod: jest.MockedFunction<typeof friendsComponent.getMutualFriends>

  const rpcContext: RpcServerContext = {
    address: '0x1234567890123456789012345678901234567890',
    subscribersContext: undefined
  }

  const mutualFriendsRequest: GetMutualFriendsPayload = {
    user: { address: '0x4567890123456789012345678901234567890123' },
    pagination: { limit: 10, offset: 0 }
  }

  beforeEach(() => {
    getMutualFriendsMethod = jest.fn()
    friendsComponent = createFriendsMockedComponent({
      getMutualFriends: getMutualFriendsMethod
    })

    getMutualFriends = getMutualFriendsService({
      components: { friends: friendsComponent, logs: mockLogs }
    })
  })

  describe('when getting the users mutual friends fails', () => {
    beforeEach(() => {
      getMutualFriendsMethod.mockRejectedValue(new Error('Database error'))
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

  describe('when getting the users mutual friends succeeds', () => {
    let mutualFriendsData: {
      friendsProfiles: any[]
      total: number
    }

    beforeEach(() => {
      mutualFriendsData = {
        friendsProfiles: [],
        total: 0
      }
      getMutualFriendsMethod.mockResolvedValue(mutualFriendsData)
    })

    describe('and there are no mutual friends', () => {
      beforeEach(() => {
        mutualFriendsData.friendsProfiles = []
        mutualFriendsData.total = 0
      })

      it('should return an empty list', async () => {
        const response = await getMutualFriends(mutualFriendsRequest, rpcContext)

        expect(getMutualFriendsMethod).toHaveBeenCalledWith(
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

        expect(getMutualFriendsMethod).toHaveBeenCalledWith(
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

  describe('when the user address is missing', () => {
    const requestWithoutAddress: GetMutualFriendsPayload = {
      user: undefined,
      pagination: { limit: 10, offset: 0 }
    }

    it('should return an empty list', async () => {
      const response = await getMutualFriends(requestWithoutAddress, rpcContext)

      expect(getMutualFriendsMethod).not.toHaveBeenCalled()
      expect(response).toEqual({
        friends: [],
        paginationData: {
          total: 0,
          page: 1
        }
      })
    })
  })

  describe('when the user address is invalid', () => {
    const requestWithInvalidAddress: GetMutualFriendsPayload = {
      user: { address: 'invalid-address' },
      pagination: { limit: 10, offset: 0 }
    }

    it('should return an empty list', async () => {
      const response = await getMutualFriends(requestWithInvalidAddress, rpcContext)

      expect(getMutualFriendsMethod).not.toHaveBeenCalled()
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
