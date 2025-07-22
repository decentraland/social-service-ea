import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { createFriendsMockedComponent, mockLogs } from '../../../../mocks/components'
import { getFriendsService } from '../../../../../src/controllers/handlers/rpc/get-friends'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { parseExpectedFriends } from '../../../../mocks/friend'
import { IFriendsComponent } from '../../../../../src/logic/friends'

describe('Get Friends Service', () => {
  let getFriends: ReturnType<typeof getFriendsService>
  const parseFriend = parseExpectedFriends()
  let friendsComponent: IFriendsComponent
  let getFriendsProfiles: jest.MockedFunction<typeof friendsComponent.getFriendsProfiles>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(async () => {
    getFriendsProfiles = jest.fn()
    friendsComponent = createFriendsMockedComponent({
      getFriendsProfiles
    })

    getFriends = getFriendsService({
      components: { friends: friendsComponent, logs: mockLogs }
    })
  })

  describe('when getting the users friends fails', () => {
    beforeEach(() => {
      getFriendsProfiles.mockRejectedValue(new Error('Database error'))
    })

    it('should return an empty list', async () => {
      const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

      expect(response).toEqual({
        friends: [],
        paginationData: {
          total: 0,
          page: 1
        }
      })
    })
  })

  describe('when getting the users friends succeeds', () => {
    let friendsData: {
      friendsProfiles: Profile[]
      total: number
    }

    beforeEach(() => {
      friendsData = {
        friendsProfiles: [],
        total: 0
      }
      getFriendsProfiles.mockResolvedValue(friendsData)
    })

    describe('and there are no friends', () => {
      beforeEach(() => {
        friendsData.friendsProfiles = []
        friendsData.total = 0
      })

      it('should return an empty list', async () => {
        const response = await getFriends({ pagination: { limit: 10, offset: 0 } }, rpcContext)

        expect(getFriendsProfiles).toHaveBeenCalledWith(rpcContext.address, { limit: 10, offset: 0 })
        expect(response).toEqual({
          friends: [],
          paginationData: {
            total: 0,
            page: 1
          }
        })
      })
    })

    describe(`and there are multiple friends`, () => {
      beforeEach(() => {
        friendsData.friendsProfiles = [createMockProfile('0x123'), createMockProfile('0x456')]
        friendsData.total = 2
      })

      it('should return the list of friends with the pagination data for the page', async () => {
        const response = await getFriends({ pagination: { limit: 2, offset: 0 } }, rpcContext)

        expect(getFriendsProfiles).toHaveBeenCalledWith(rpcContext.address, { limit: 2, offset: 0 })
        expect(response).toEqual({
          friends: [parseFriend(friendsData.friendsProfiles[0]), parseFriend(friendsData.friendsProfiles[1])],
          paginationData: {
            total: friendsData.total,
            page: 1
          }
        })
      })
    })
  })
})
