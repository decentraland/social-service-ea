import {
  BlockedUserProfile,
  BlockUserResponse,
  FriendshipRequests,
  PaginatedFriendshipRequestsResponse,
  PrivateMessagePrivacySetting
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { test } from '../components'
import { createMockProfile } from '../mocks/profile'
import {
  createOrUpdateSocialSettings,
  createOrUpsertActiveFriendship,
  createPendingFriendshipRequest,
  removeFriendship,
  removeSocialSettings
} from './utils/friendships'
import { parseProfileToBlockedUser } from '../../src/logic/blocks'
import { PrivateMessagesPrivacy, User } from '../../src/types'

test('RPC Server Controller', function ({ components, stubComponents }) {
  beforeAll(async () => {
    await components.rpcClient.connect()
    stubComponents.peersSynchronizer.syncPeers.resolves()
  })

  describe('GetFriends handler', function () {
    it('should return friends list successfully', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const mockFriendProfile = createMockProfile(friendAddress)
      const id = await createOrUpsertActiveFriendship(db, [rpcClient.authAddress, friendAddress])

      stubComponents.catalystClient.getProfiles.resolves([mockFriendProfile])

      const response = await rpcClient.client.getFriends({
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(response.friends.length).toEqual(1)
      expect(response.friends[0].address).toEqual(friendAddress)

      await removeFriendship(db, id, rpcClient.authAddress)
    })

    it('should return empty list when user has no friends', async () => {
      const { rpcClient } = components
      stubComponents.catalystClient.getProfiles.resolves([])

      const response = await rpcClient.client.getFriends({
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(response.friends).toHaveLength(0)
    })
  })

  describe('GetMutualFriends handler', function () {
    it('should return mutual friends successfully', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const mutualFriendAddress = '0x77c4c17331436d3b8798596e3d7c0d8e1b786aa4'
      const mockMutualFriendProfile = createMockProfile(mutualFriendAddress)

      stubComponents.catalystClient.getProfiles.resolves([mockMutualFriendProfile])

      const id1 = await createOrUpsertActiveFriendship(db, [rpcClient.authAddress, friendAddress])
      const id2 = await createOrUpsertActiveFriendship(db, [rpcClient.authAddress, mutualFriendAddress])
      const id3 = await createOrUpsertActiveFriendship(db, [friendAddress, mutualFriendAddress])

      const response = await rpcClient.client.getMutualFriends({
        user: {
          address: friendAddress
        },
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(response.friends).toHaveLength(1)
      expect(response.friends[0].address).toEqual(mutualFriendAddress)

      await removeFriendship(db, id1, rpcClient.authAddress)
      await removeFriendship(db, id2, rpcClient.authAddress)
      await removeFriendship(db, id3, friendAddress)
    })

    it('should return empty list when no mutual friends exist', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const id = await createOrUpsertActiveFriendship(db, [rpcClient.authAddress, friendAddress])

      stubComponents.catalystClient.getProfiles.resolves([])

      const response = await rpcClient.client.getMutualFriends({
        user: {
          address: friendAddress
        },
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(response.friends).toHaveLength(0)

      await removeFriendship(db, id, rpcClient.authAddress)
    })
  })

  describe('getPendingFriendshipRequests', function () {
    it('should return pending friendship requests successfully', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const mockFriendProfile = createMockProfile(friendAddress)

      const id = await createPendingFriendshipRequest(db, [friendAddress, rpcClient.authAddress])

      stubComponents.catalystClient.getProfiles.resolves([mockFriendProfile])

      const result = await rpcClient.client.getPendingFriendshipRequests({
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      assertFriendshipRequests(result, (requests) => {
        expect(requests.length).toEqual(1)
        expect(requests[0].friend.address).toEqual(friendAddress)
      })

      await removeFriendship(db, id, friendAddress)
    })

    it('should return empty list when user has no pending friendship requests', async () => {
      const { rpcClient } = components
      stubComponents.catalystClient.getProfiles.resolves([])
      const result = await rpcClient.client.getPendingFriendshipRequests({
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      assertFriendshipRequests(result, (requests) => {
        expect(requests.length).toEqual(0)
      })
    })

    it('should return pending requests paginated with most recent first', async () => {
      const { rpcClient, db } = components
      const friendAddresses = [
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd1',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd2',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd3'
      ]

      const mockProfiles = friendAddresses.map((addr) => createMockProfile(addr))

      const requestIds = []
      for (const addr of friendAddresses) {
        const id = await createPendingFriendshipRequest(db, [addr, rpcClient.authAddress])
        requestIds.push(id)
      }

      stubComponents.catalystClient.getProfiles.resolves(mockProfiles)

      const firstPage = await rpcClient.client.getPendingFriendshipRequests({
        pagination: {
          limit: 2,
          offset: 0
        }
      })

      assertFriendshipRequests(firstPage, (requests) => {
        expect(requests.length).toEqual(2)
        expect(requests[0].friend.address).toEqual(friendAddresses[2])
        expect(requests[1].friend.address).toEqual(friendAddresses[1])
      })

      const secondPage = await rpcClient.client.getPendingFriendshipRequests({
        pagination: {
          limit: 2,
          offset: 2
        }
      })

      assertFriendshipRequests(secondPage, (requests) => {
        expect(requests.length).toEqual(1)
        expect(requests[0].friend.address).toEqual(friendAddresses[0])
      })

      await Promise.all(requestIds.map((id, index) => removeFriendship(db, id, friendAddresses[index])))
    })
  })

  describe('getSentFriendshipRequests', function () {
    it('should return sent friendship requests successfully', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd2'
      const mockFriendProfile = createMockProfile(friendAddress)

      const id = await createPendingFriendshipRequest(db, [rpcClient.authAddress, friendAddress])

      stubComponents.catalystClient.getProfiles.resolves([mockFriendProfile])

      const result = await rpcClient.client.getSentFriendshipRequests({
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      assertFriendshipRequests(result, (requests) => {
        expect(requests.length).toEqual(1)
        expect(requests[0].friend.address).toEqual(friendAddress)
      })

      await removeFriendship(db, id, rpcClient.authAddress)
    })

    it('should return empty list when user has no sent friendship requests', async () => {
      const { rpcClient } = components
      stubComponents.catalystClient.getProfiles.resolves([])
      const result = await rpcClient.client.getSentFriendshipRequests({
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      assertFriendshipRequests(result, (requests) => {
        expect(requests.length).toEqual(0)
      })
    })

    it('should return sent requests paginated with most recent first', async () => {
      const { rpcClient, db } = components
      const friendAddresses = [
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd1',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd2',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd3'
      ]

      const mockProfiles = friendAddresses.map((addr) => createMockProfile(addr))

      const requestIds = []
      for (const addr of friendAddresses) {
        const id = await createPendingFriendshipRequest(db, [rpcClient.authAddress, addr])
        requestIds.push(id)
      }

      stubComponents.catalystClient.getProfiles.resolves(mockProfiles)

      const firstPage = await rpcClient.client.getSentFriendshipRequests({
        pagination: {
          limit: 2,
          offset: 0
        }
      })

      assertFriendshipRequests(firstPage, (requests) => {
        expect(requests.length).toEqual(2)
        expect(requests[0].friend.address).toEqual(friendAddresses[2])
        expect(requests[1].friend.address).toEqual(friendAddresses[1])
      })

      const secondPage = await rpcClient.client.getSentFriendshipRequests({
        pagination: {
          limit: 2,
          offset: 2
        }
      })

      assertFriendshipRequests(secondPage, (requests) => {
        expect(requests.length).toEqual(1)
        expect(requests[0].friend.address).toEqual(friendAddresses[0])
      })

      await Promise.all(requestIds.map((id, index) => removeFriendship(db, id, friendAddresses[index])))
    })
  })

  describe('blockUser', function () {
    const blockedAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd2'

    it('should block a user successfully', async () => {
      const { rpcClient } = components
      const mockBlockedProfile = createMockProfile(blockedAddress)

      stubComponents.catalystClient.getProfile.resolves(mockBlockedProfile)

      const result = await rpcClient.client.blockUser({
        user: {
          address: blockedAddress
        }
      })

      assertSuccessBlockingUnblocking(result, parseProfileToBlockedUser(mockBlockedProfile), expect.any(Number))

      await components.db.unblockUser(rpcClient.authAddress, blockedAddress)
    })

    it('should block a user successfully when the user is already blocked', async () => {
      const { rpcClient } = components
      const blockedAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd2'
      const mockBlockedProfile = createMockProfile(blockedAddress)

      stubComponents.catalystClient.getProfile.resolves(mockBlockedProfile)

      new Array(2).forEach(async (_, _index) => {
        const result = await rpcClient.client.blockUser({
          user: {
            address: blockedAddress
          }
        })

        assertSuccessBlockingUnblocking(result, parseProfileToBlockedUser(mockBlockedProfile), expect.any(Number))
      })

      await components.db.unblockUser(rpcClient.authAddress, blockedAddress)
    })
  })

  describe('unblockUser', function () {
    it('should unblock a user successfully', async () => {
      const { rpcClient } = components
      const blockedAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd2'
      const mockBlockedProfile = createMockProfile(blockedAddress)

      stubComponents.catalystClient.getProfile.resolves(mockBlockedProfile)

      await components.db.blockUser(rpcClient.authAddress, blockedAddress)

      const result = await rpcClient.client.unblockUser({
        user: {
          address: blockedAddress
        }
      })

      assertSuccessBlockingUnblocking(result, parseProfileToBlockedUser(mockBlockedProfile))
    })
  })

  describe('when getting the private message settings', function () {
    let requestedUsers: User[]

    beforeEach(() => {
      requestedUsers = [
        { address: '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1' },
        { address: '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd2' }
      ]
    })

    describe("and some of the requested users don't have social settings", function () {
      beforeEach(async () => {
        const { db } = components
        await createOrUpdateSocialSettings(db, requestedUsers[0].address, PrivateMessagesPrivacy.ONLY_FRIENDS)
      })

      afterEach(async () => {
        const { db } = components
        await removeSocialSettings(db, requestedUsers[0].address)
      })

      it('should return the private message settings as ALL for the requested users without social settings', async () => {
        const { rpcClient } = components
        const result = await rpcClient.client.getPrivateMessagesSettings({
          user: requestedUsers
        })

        assertOkCase(result, {
          settings: [
            {
              user: {
                address: requestedUsers[0].address
              },
              privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS,
              isFriend: false
            },
            {
              user: {
                address: requestedUsers[1].address
              },
              privateMessagesPrivacy: PrivateMessagePrivacySetting.ALL,
              isFriend: false
            }
          ]
        })
      })
    })

    describe('and all the requested users have social settings', function () {
      beforeEach(async () => {
        const { db } = components
        await createOrUpdateSocialSettings(db, requestedUsers[0].address, PrivateMessagesPrivacy.ONLY_FRIENDS)
        await createOrUpdateSocialSettings(db, requestedUsers[1].address, PrivateMessagesPrivacy.ONLY_FRIENDS)
      })

      afterEach(async () => {
        const { db } = components
        await removeSocialSettings(db, requestedUsers[0].address)
        await removeSocialSettings(db, requestedUsers[1].address)
      })

      it('should return the private message settings as ALL for the requested users without social settings', async () => {
        const { rpcClient } = components
        const result = await rpcClient.client.getPrivateMessagesSettings({
          user: requestedUsers
        })

        assertOkCase(result, {
          settings: [
            {
              user: {
                address: requestedUsers[0].address
              },
              privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS,
              isFriend: false
            },
            {
              user: {
                address: requestedUsers[1].address
              },
              privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS,
              isFriend: false
            }
          ]
        })
      })
    })

    describe('and some of the requested users are friends', function () {
      let id: string

      beforeEach(async () => {
        const { db, rpcClient } = components
        // Ensure addresses are normalized to lowercase
        const normalizedRpcAddress = rpcClient.authAddress.toLowerCase()
        const normalizedFriendAddress = requestedUsers[0].address.toLowerCase()

        // Create the friendship with normalized addresses
        id = await createOrUpsertActiveFriendship(db, [normalizedRpcAddress, normalizedFriendAddress])
        await createOrUpdateSocialSettings(db, normalizedFriendAddress, PrivateMessagesPrivacy.ONLY_FRIENDS)
      })

      afterEach(async () => {
        const { db, rpcClient } = components
        // await removeFriendship(db, id, rpcClient.authAddress.toLowerCase())
        await removeSocialSettings(db, requestedUsers[0].address.toLowerCase())
      })

      it("should return the private message settings for all requested users with the isFriend flag set to true for the user's friends", async () => {
        const { rpcClient } = components
        const result = await rpcClient.client.getPrivateMessagesSettings({
          user: requestedUsers
        })

        assertOkCase(result, {
          settings: [
            {
              user: {
                address: requestedUsers[0].address
              },
              privateMessagesPrivacy: PrivateMessagePrivacySetting.ONLY_FRIENDS,
              isFriend: true
            },
            {
              user: {
                address: requestedUsers[1].address
              },
              privateMessagesPrivacy: PrivateMessagePrivacySetting.ALL,
              isFriend: false
            }
          ]
        })
      })
    })
  })

  // Assert ok case
  function assertOkCase<T>(result: { response?: { $case: string; ok?: T } | undefined }, expectedResult: T) {
    expect(result?.response?.$case).toEqual('ok')
    expect(result?.response?.ok).toEqual(expectedResult)
  }

  // Helper functions
  function assertFriendshipRequests(
    result: PaginatedFriendshipRequestsResponse,
    assertions: (requests: FriendshipRequests['requests']) => void
  ) {
    const { response } = result

    expect(response.$case).toEqual('requests')

    if (response.$case === 'requests') {
      const {
        requests: { requests }
      } = response
      assertions(requests)
    }
  }

  function assertSuccessBlockingUnblocking(
    result: BlockUserResponse,
    expectedBlockedUser: BlockedUserProfile,
    expectedBlockedAt?: number
  ) {
    expect(result.response.$case).toEqual('ok')
    if (result.response.$case === 'ok') {
      expect(result.response.ok.profile).toEqual({
        ...expectedBlockedUser,
        blockedAt: expectedBlockedAt
      })
    }
  }
})
