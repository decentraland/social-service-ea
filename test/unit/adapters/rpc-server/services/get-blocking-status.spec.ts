import { createFriendsMockedComponent, mockLogs } from '../../../../mocks/components'
import { getBlockingStatusService } from '../../../../../src/controllers/handlers/rpc/get-blocking-status'
import { RpcServerContext } from '../../../../../src/types'
import { IFriendsComponent } from '../../../../../src/logic/friends'

describe('Get Blocking Status Service', () => {
  let getBlockingStatus: ReturnType<typeof getBlockingStatusService>
  let friendsComponent: IFriendsComponent
  let getBlockingStatusMethod: jest.MockedFunction<typeof friendsComponent.getBlockingStatus>

  const rpcContext: RpcServerContext = {
    address: '0x123',
    subscribersContext: undefined
  }

  beforeEach(() => {
    getBlockingStatusMethod = jest.fn()
    friendsComponent = createFriendsMockedComponent({
      getBlockingStatus: getBlockingStatusMethod
    })

    getBlockingStatus = getBlockingStatusService({
      components: { friends: friendsComponent, logs: mockLogs }
    })
  })

  describe('when getting the users blocking status fails', () => {
    beforeEach(() => {
      getBlockingStatusMethod.mockRejectedValue(new Error('Database error'))
    })

    it('should return empty arrays', async () => {
      const response = await getBlockingStatus({}, rpcContext)

      expect(response).toEqual({
        blockedUsers: [],
        blockedByUsers: []
      })
    })
  })

  describe('when getting the users blocking status succeeds', () => {
    let blockingStatusData: {
      blockedUsers: string[]
      blockedByUsers: string[]
    }

    beforeEach(() => {
      blockingStatusData = {
        blockedUsers: [],
        blockedByUsers: []
      }
      getBlockingStatusMethod.mockResolvedValue(blockingStatusData)
    })

    describe('and there are no blocked users and no blocked by users', () => {
      beforeEach(() => {
        blockingStatusData.blockedUsers = []
        blockingStatusData.blockedByUsers = []
      })

      it('should return empty arrays', async () => {
        const response = await getBlockingStatus({}, rpcContext)

        expect(getBlockingStatusMethod).toHaveBeenCalledWith(rpcContext.address)
        expect(response).toEqual({
          blockedUsers: [],
          blockedByUsers: []
        })
      })
    })

    describe('and there are blocked users and blocked by users', () => {
      beforeEach(() => {
        blockingStatusData.blockedUsers = ['0x456', '0x789']
        blockingStatusData.blockedByUsers = ['0x123', '0x456']
      })

      it('should return the blocking status data', async () => {
        const response = await getBlockingStatus({}, rpcContext)

        expect(getBlockingStatusMethod).toHaveBeenCalledWith(rpcContext.address)
        expect(response).toEqual({
          blockedUsers: ['0x456', '0x789'],
          blockedByUsers: ['0x123', '0x456']
        })
      })
    })

    describe('and there are only blocked users', () => {
      beforeEach(() => {
        blockingStatusData.blockedUsers = ['0x456', '0x789']
        blockingStatusData.blockedByUsers = []
      })

      it('should return blocked users and empty blocked by users array', async () => {
        const response = await getBlockingStatus({}, rpcContext)

        expect(getBlockingStatusMethod).toHaveBeenCalledWith(rpcContext.address)
        expect(response).toEqual({
          blockedUsers: ['0x456', '0x789'],
          blockedByUsers: []
        })
      })
    })

    describe('and there are only blocked by users', () => {
      beforeEach(() => {
        blockingStatusData.blockedUsers = []
        blockingStatusData.blockedByUsers = ['0x123', '0x456']
      })

      it('should return empty blocked users array and blocked by users', async () => {
        const response = await getBlockingStatus({}, rpcContext)

        expect(getBlockingStatusMethod).toHaveBeenCalledWith(rpcContext.address)
        expect(response).toEqual({
          blockedUsers: [],
          blockedByUsers: ['0x123', '0x456']
        })
      })
    })
  })
})
