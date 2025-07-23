import { createFriendsMockedComponent, mockLogs } from '../../../../mocks/components'
import { getBlockedUsersService } from '../../../../../src/controllers/handlers/rpc/get-blocked-users'
import { RpcServerContext } from '../../../../../src/types'
import { createMockProfile } from '../../../../mocks/profile'
import { parseProfilesToBlockedUsers } from '../../../../../src/logic/friends'
import { IFriendsComponent } from '../../../../../src/logic/friends'

describe('when getting blocked users', () => {
  let getBlockedUsers: ReturnType<typeof getBlockedUsersService>
  let friendsComponent: IFriendsComponent
  let getBlockedUsersMethod: jest.MockedFunction<typeof friendsComponent.getBlockedUsers>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(() => {
    getBlockedUsersMethod = jest.fn()
    friendsComponent = createFriendsMockedComponent({
      getBlockedUsers: getBlockedUsersMethod
    })

    getBlockedUsers = getBlockedUsersService({
      components: { friends: friendsComponent, logs: mockLogs }
    })
  })

  describe('and getting the users blocked users fails', () => {
    beforeEach(() => {
      getBlockedUsersMethod.mockRejectedValue(new Error('Database error'))
    })

    it('should return an empty list', async () => {
      const response = await getBlockedUsers({ pagination: { limit: 10, offset: 0 } }, rpcContext)

      expect(response).toEqual({
        profiles: [],
        paginationData: {
          total: 0,
          page: 1
        }
      })
    })
  })

  describe('and getting the users blocked users succeeds', () => {
    let blockedUsersData: {
      blockedUsers: Array<{ address: string; blocked_at: Date }>
      blockedProfiles: any[]
      total: number
    }

    beforeEach(() => {
      blockedUsersData = {
        blockedUsers: [],
        blockedProfiles: [],
        total: 0
      }
      getBlockedUsersMethod.mockResolvedValue(blockedUsersData)
    })

    describe('and there are no blocked users', () => {
      beforeEach(() => {
        blockedUsersData.blockedUsers = []
        blockedUsersData.blockedProfiles = []
        blockedUsersData.total = 0
      })

      it('should return an empty list', async () => {
        const response = await getBlockedUsers({ pagination: { limit: 10, offset: 0 } }, rpcContext)

        expect(getBlockedUsersMethod).toHaveBeenCalledWith(rpcContext.address)
        expect(response).toEqual({
          profiles: [],
          paginationData: {
            total: 0,
            page: 1
          }
        })
      })
    })

    describe('and there are multiple blocked users', () => {
      beforeEach(() => {
        const mockProfiles = [createMockProfile('0x456'), createMockProfile('0x789')]
        blockedUsersData.blockedUsers = [
          { address: '0x456', blocked_at: new Date() },
          { address: '0x789', blocked_at: new Date() }
        ]
        blockedUsersData.blockedProfiles = mockProfiles
        blockedUsersData.total = 2
      })

      it('should return the list of blocked users with the pagination data for the page', async () => {
        const response = await getBlockedUsers({ pagination: { limit: 2, offset: 0 } }, rpcContext)

        expect(getBlockedUsersMethod).toHaveBeenCalledWith(rpcContext.address)
        expect(response).toEqual({
          profiles: parseProfilesToBlockedUsers(blockedUsersData.blockedProfiles, blockedUsersData.blockedUsers),
          paginationData: {
            total: blockedUsersData.total,
            page: 1
          }
        })
      })
    })
  })
})
