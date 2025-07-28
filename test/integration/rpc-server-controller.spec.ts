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
import { PrivateMessagesPrivacy, User, CommunityRole } from '../../src/types'
import { parseProfileToBlockedUser } from '../../src/logic/friends'

test('RPC Server Controller', function ({ components, stubComponents }) {
  beforeAll(async () => {
    await components.rpcClient.connect()
    stubComponents.peersSynchronizer.syncPeers.resolves()
  })

  describe('when getting friends', function () {
    it('should return friends list successfully', async () => {
      const { rpcClient, friendsDb } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const mockFriendProfile = createMockProfile(friendAddress)
      const id = await createOrUpsertActiveFriendship(friendsDb, [rpcClient.authAddress, friendAddress])

      stubComponents.catalystClient.getProfiles.resolves([mockFriendProfile])

      const response = await rpcClient.client.getFriends({
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(response.friends.length).toEqual(1)
      expect(response.friends[0].address).toEqual(friendAddress)

      await removeFriendship(friendsDb, id, rpcClient.authAddress)
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

  describe('when getting mutual friends', function () {
    it('should return mutual friends successfully', async () => {
      const { rpcClient, friendsDb } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const mutualFriendAddress = '0x77c4c17331436d3b8798596e3d7c0d8e1b786aa4'
      const mockMutualFriendProfile = createMockProfile(mutualFriendAddress)

      stubComponents.catalystClient.getProfiles.resolves([mockMutualFriendProfile])

      const id1 = await createOrUpsertActiveFriendship(friendsDb, [rpcClient.authAddress, friendAddress])
      const id2 = await createOrUpsertActiveFriendship(friendsDb, [rpcClient.authAddress, mutualFriendAddress])
      const id3 = await createOrUpsertActiveFriendship(friendsDb, [friendAddress, mutualFriendAddress])

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

      await removeFriendship(friendsDb, id1, rpcClient.authAddress)
      await removeFriendship(friendsDb, id2, rpcClient.authAddress)
      await removeFriendship(friendsDb, id3, friendAddress)
    })

    it('should return empty list when no mutual friends exist', async () => {
      const { rpcClient, friendsDb } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const id = await createOrUpsertActiveFriendship(friendsDb, [rpcClient.authAddress, friendAddress])

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

      await removeFriendship(friendsDb, id, rpcClient.authAddress)
    })
  })

  describe('when getting pending friendship requests', function () {
    it('should return pending friendship requests successfully', async () => {
      const { rpcClient, friendsDb } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const mockFriendProfile = createMockProfile(friendAddress)

      const id = await createPendingFriendshipRequest(friendsDb, [friendAddress, rpcClient.authAddress])

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

      await removeFriendship(friendsDb, id, friendAddress)
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
      const { rpcClient, friendsDb } = components
      const friendAddresses = [
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd1',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd2',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd3'
      ]

      const mockProfiles = friendAddresses.map((addr) => createMockProfile(addr))

      const requestIds = []
      for (const addr of friendAddresses) {
        const id = await createPendingFriendshipRequest(friendsDb, [addr, rpcClient.authAddress])
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

      await Promise.all(requestIds.map((id, index) => removeFriendship(friendsDb, id, friendAddresses[index])))
    })
  })

  describe('when getting sent friendship requests', function () {
    it('should return sent friendship requests successfully', async () => {
      const { rpcClient, friendsDb } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd2'
      const mockFriendProfile = createMockProfile(friendAddress)

      const id = await createPendingFriendshipRequest(friendsDb, [rpcClient.authAddress, friendAddress])

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

      await removeFriendship(friendsDb, id, rpcClient.authAddress)
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
      const { rpcClient, friendsDb } = components
      const friendAddresses = [
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd1',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd2',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd3'
      ]

      const mockProfiles = friendAddresses.map((addr) => createMockProfile(addr))

      const requestIds = []
      for (const addr of friendAddresses) {
        const id = await createPendingFriendshipRequest(friendsDb, [rpcClient.authAddress, addr])
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

      await Promise.all(requestIds.map((id, index) => removeFriendship(friendsDb, id, friendAddresses[index])))
    })
  })

  describe('when blocking a user', function () {
    const blockedAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd2'

    describe('and the user is not blocked', () => {
      let mockBlockedProfile: any

      beforeEach(() => {
        mockBlockedProfile = createMockProfile(blockedAddress)
        stubComponents.catalystClient.getProfile.resolves(mockBlockedProfile)
      })

      afterEach(async () => {
        // Clean up: unblock the user after test
        await components.friendsDb.unblockUser(components.rpcClient.authAddress, blockedAddress)
      })

      it('should block a user successfully', async () => {
        const { rpcClient } = components

        const result = await rpcClient.client.blockUser({
          user: {
            address: blockedAddress
          }
        })

        assertSuccessBlockingUnblocking(result, parseProfileToBlockedUser(mockBlockedProfile), expect.any(Number))
      })

      it('should block a user successfully when the user is already blocked', async () => {
        const { rpcClient } = components

        // Block the user twice
        for (let i = 0; i < 2; i++) {
          const result = await rpcClient.client.blockUser({
            user: {
              address: blockedAddress
            }
          })

          assertSuccessBlockingUnblocking(result, parseProfileToBlockedUser(mockBlockedProfile), expect.any(Number))
        }
      })
    })
  })

  describe('when unblocking a user', function () {
    const blockedAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd2'

    describe('and the user is blocked', () => {
      let mockBlockedProfile: any

      beforeEach(async () => {
        mockBlockedProfile = createMockProfile(blockedAddress)
        stubComponents.catalystClient.getProfile.resolves(mockBlockedProfile)

        // Setup: block the user first
        await components.friendsDb.blockUser(components.rpcClient.authAddress, blockedAddress)
      })

      it('should unblock a user successfully', async () => {
        const { rpcClient } = components

        const result = await rpcClient.client.unblockUser({
          user: {
            address: blockedAddress
          }
        })

        assertSuccessBlockingUnblocking(result, parseProfileToBlockedUser(mockBlockedProfile))
      })
    })
  })

  describe('when getting private message settings', () => {
    let requestedUsers: User[]

    beforeEach(() => {
      requestedUsers = [
        { address: '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1' },
        { address: '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd2' }
      ]
    })

    describe("and some of the requested users don't have social settings", () => {
      beforeEach(async () => {
        const { friendsDb } = components
        await createOrUpdateSocialSettings(friendsDb, requestedUsers[0].address, PrivateMessagesPrivacy.ONLY_FRIENDS)
      })

      afterEach(async () => {
        const { friendsDb } = components
        await removeSocialSettings(friendsDb, requestedUsers[0].address)
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

    describe('and all the requested users have social settings', () => {
      beforeEach(async () => {
        const { friendsDb } = components
        await createOrUpdateSocialSettings(friendsDb, requestedUsers[0].address, PrivateMessagesPrivacy.ONLY_FRIENDS)
        await createOrUpdateSocialSettings(friendsDb, requestedUsers[1].address, PrivateMessagesPrivacy.ONLY_FRIENDS)
      })

      afterEach(async () => {
        const { friendsDb } = components
        await removeSocialSettings(friendsDb, requestedUsers[0].address)
        await removeSocialSettings(friendsDb, requestedUsers[1].address)
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

    describe('and some of the requested users are friends', () => {
      let id: string

      beforeEach(async () => {
        const { friendsDb, rpcClient } = components
        // Ensure addresses are normalized to lowercase
        const normalizedRpcAddress = rpcClient.authAddress.toLowerCase()
        const normalizedFriendAddress = requestedUsers[0].address.toLowerCase()

        // Create the friendship with normalized addresses
        id = await createOrUpsertActiveFriendship(friendsDb, [normalizedRpcAddress, normalizedFriendAddress])
        await createOrUpdateSocialSettings(friendsDb, normalizedFriendAddress, PrivateMessagesPrivacy.ONLY_FRIENDS)
      })

      afterEach(async () => {
        const { friendsDb, rpcClient } = components
        await removeFriendship(friendsDb, id, rpcClient.authAddress.toLowerCase())
        await removeSocialSettings(friendsDb, requestedUsers[0].address.toLowerCase())
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

    describe('and the user requested settings for an amount of users greater than the limit', () => {
      it('should return an invalid request case with a message indicating that the amount of users is greater than the limit', async () => {
        const { rpcClient } = components

        const result = await rpcClient.client.getPrivateMessagesSettings({
          user: Array.from({ length: 51 }, (_, index) => ({
            address: `0x06b7c9e6aef7f6b6c259831953309f63c59bcfd${index}`
          }))
        })

        assertInvalidRequestCase(result, 'Too many user addresses: 51')
      })
    })
  })

  describe('when working with community voice chat', () => {
    let testCommunity: any
    let communityId: string
    let communitiesDbSpy: any = {}
    let commsGatekeeperSpy: any = {}
    let analyticsSpy: any = {}
    let catalystClientSpy: any = {}

    beforeEach(async () => {
      const { rpcClient, communitiesDb } = components

      // Set up spies for real components (only for community voice tests)
      commsGatekeeperSpy.createCommunityVoiceChatRoom = jest.spyOn(
        components.commsGatekeeper,
        'createCommunityVoiceChatRoom'
      )
      commsGatekeeperSpy.getCommunityVoiceChatCredentials = jest.spyOn(
        components.commsGatekeeper,
        'getCommunityVoiceChatCredentials'
      )
      commsGatekeeperSpy.getCommunityVoiceChatStatus = jest.spyOn(
        components.commsGatekeeper,
        'getCommunityVoiceChatStatus'
      )
      catalystClientSpy.getProfile = jest.spyOn(components.catalystClient, 'getProfile')
      analyticsSpy.fireEvent = jest.spyOn(components.analytics, 'fireEvent')

      // Create test community
      testCommunity = {
        name: 'Test Community Voice Chat',
        description: 'A test community for voice chat RPC testing',
        owner_address: rpcClient.authAddress.toLowerCase(),
        private: false,
        active: true
      }

      const community = await communitiesDb.createCommunity(testCommunity)
      communityId = community.id

      // Add the RPC client user as a member of the community (owner should be automatically added)
      await communitiesDb.addCommunityMember({
        communityId: community.id,
        memberAddress: rpcClient.authAddress.toLowerCase(),
        role: CommunityRole.Owner
      })

      // Setup spies for DB methods to verify interactions
      communitiesDbSpy.getCommunityMemberRole = jest.spyOn(communitiesDb, 'getCommunityMemberRole')
      communitiesDbSpy.getCommunity = jest.spyOn(communitiesDb, 'getCommunity')
      communitiesDbSpy.isMemberBanned = jest.spyOn(communitiesDb, 'isMemberBanned')

      // Set default mocks (will be overridden in specific test scenarios)
      commsGatekeeperSpy.createCommunityVoiceChatRoom.mockResolvedValue({
        connectionUrl: 'livekit:wss://voice.test.decentraland.org?access_token=test-token'
      })
      commsGatekeeperSpy.getCommunityVoiceChatCredentials.mockResolvedValue({
        connectionUrl: 'livekit:wss://voice.test.decentraland.org?access_token=test-token'
      })
      commsGatekeeperSpy.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: false,
        participantCount: 0,
        moderatorCount: 0
      })
      catalystClientSpy.getProfile.mockResolvedValue({
        avatars: [
          {
            name: 'testuser',
            userId: rpcClient.authAddress.toLowerCase(),
            hasClaimedName: true,
            avatar: {
              snapshots: {
                face256: 'https://test.com/face.png'
              }
            }
          }
        ]
      })
      analyticsSpy.fireEvent.mockResolvedValue(undefined)
    })

    afterEach(async () => {
      const { communitiesDbHelper } = components

      // Clean up spies
      Object.values(communitiesDbSpy).forEach((spy) => (spy as jest.SpyInstance).mockRestore?.())
      Object.values(commsGatekeeperSpy).forEach((spy) => (spy as jest.SpyInstance).mockRestore?.())
      Object.values(analyticsSpy).forEach((spy) => (spy as jest.SpyInstance).mockRestore?.())
      Object.values(catalystClientSpy).forEach((spy) => (spy as jest.SpyInstance).mockRestore?.())

      // Clean up community data
      if (communityId) {
        await communitiesDbHelper.forceCommunityRemoval(communityId)
      }
    })

    describe('and starting a community voice chat', () => {
      describe('and user is community owner and voice chat is not active', () => {
        beforeEach(() => {
          // Mock successful external service responses
          commsGatekeeperSpy.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: false,
            participantCount: 0,
            moderatorCount: 0
          })
          commsGatekeeperSpy.createCommunityVoiceChatRoom.mockResolvedValue({
            connectionUrl: 'livekit:wss://voice.test.decentraland.org?access_token=test-token'
          })
          catalystClientSpy.getProfile.mockResolvedValue({
            avatars: [
              {
                name: 'testuser',
                userId: components.rpcClient.authAddress.toLowerCase(),
                hasClaimedName: true,
                avatar: {
                  snapshots: {
                    face256: 'https://test.com/face.png'
                  }
                }
              }
            ]
          })
          analyticsSpy.fireEvent.mockResolvedValue(undefined)
        })

        it('should successfully start a community voice chat', async () => {
          const { rpcClient } = components

          const result = await rpcClient.client.startCommunityVoiceChat({
            communityId
          })

          // Verify DB interactions occurred
          expect(communitiesDbSpy.getCommunityMemberRole).toHaveBeenCalledWith(
            communityId,
            rpcClient.authAddress.toLowerCase()
          )

          // Verify external service calls
          expect(commsGatekeeperSpy.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
          expect(commsGatekeeperSpy.createCommunityVoiceChatRoom).toHaveBeenCalledWith(
            communityId,
            rpcClient.authAddress.toLowerCase(),
            CommunityRole.Owner,
            expect.objectContaining({
              name: 'testuser',
              has_claimed_name: true,
              profile_picture_url: 'https://test.com/face.png'
            })
          )

          // Verify successful response
          expect(result.response?.$case).toBe('ok')
          if (result.response?.$case === 'ok') {
            expect(result.response.ok.credentials?.connectionUrl).toBe(
              'livekit:wss://voice.test.decentraland.org?access_token=test-token'
            )
          }
        })
      })

      describe('and community voice chat is already active', () => {
        beforeEach(() => {
          // Override mock for this specific scenario
          commsGatekeeperSpy.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: true,
            participantCount: 1,
            moderatorCount: 1
          })
        })

        it('should fail with conflict error', async () => {
          const { rpcClient } = components

          const result = await rpcClient.client.startCommunityVoiceChat({
            communityId
          })

          // Verify DB call was made to check user role
          expect(communitiesDbSpy.getCommunityMemberRole).toHaveBeenCalledWith(
            communityId,
            rpcClient.authAddress.toLowerCase()
          )

          // Verify the status check was made
          expect(commsGatekeeperSpy.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)

          // Should NOT try to create room since voice chat is already active
          expect(commsGatekeeperSpy.createCommunityVoiceChatRoom).not.toHaveBeenCalled()

          expect(result.response?.$case).toBe('conflictingError')
        })
      })

      describe('and community does not exist', () => {
        beforeEach(() => {
          // Clear and re-mock for this specific scenario
          commsGatekeeperSpy.getCommunityVoiceChatStatus.mockClear()
          commsGatekeeperSpy.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: false,
            participantCount: 0,
            moderatorCount: 0
          })
          catalystClientSpy.getProfile.mockClear()
          catalystClientSpy.getProfile.mockResolvedValue({
            avatars: [
              {
                name: 'testuser',
                userId: components.rpcClient.authAddress.toLowerCase(),
                hasClaimedName: true,
                avatar: {
                  snapshots: {
                    face256: 'https://test.com/face.png'
                  }
                }
              }
            ]
          })
        })

        it('should fail with forbidden or not found error', async () => {
          const { rpcClient } = components
          const nonExistentCommunityId = '00000000-0000-0000-0000-000000000000'

          const result = await rpcClient.client.startCommunityVoiceChat({
            communityId: nonExistentCommunityId
          })

          // Verify DB call was attempted to check user role (this should return CommunityRole.None for non-existent community)
          expect(communitiesDbSpy.getCommunityMemberRole).toHaveBeenCalledWith(
            nonExistentCommunityId,
            rpcClient.authAddress.toLowerCase()
          )

          // Should fail with either notFoundError or forbiddenError (both are valid for non-existent communities)
          expect(['notFoundError', 'forbiddenError']).toContain(result.response?.$case)
        })
      })

      describe('and external services fail', () => {
        beforeEach(() => {
          // Override mocks for this specific scenario
          commsGatekeeperSpy.createCommunityVoiceChatRoom.mockRejectedValue(new Error('Service unavailable'))
        })

        it('should handle service errors gracefully', async () => {
          const { rpcClient } = components

          const result = await rpcClient.client.startCommunityVoiceChat({
            communityId
          })

          // Verify the DB calls were made successfully before the external service failed
          expect(communitiesDbSpy.getCommunityMemberRole).toHaveBeenCalledWith(
            communityId,
            rpcClient.authAddress.toLowerCase()
          )
          expect(commsGatekeeperSpy.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
          expect(commsGatekeeperSpy.createCommunityVoiceChatRoom).toHaveBeenCalledWith(
            communityId,
            rpcClient.authAddress.toLowerCase(),
            CommunityRole.Owner,
            expect.objectContaining({
              name: 'testuser',
              has_claimed_name: true,
              profile_picture_url: 'https://test.com/face.png'
            })
          )

          expect(result.response?.$case).toBe('internalServerError')
        })
      })

      describe('and community id is invalid', () => {
        it('should fail with invalid request', async () => {
          const { rpcClient } = components

          const result = await rpcClient.client.startCommunityVoiceChat({
            communityId: ''
          })

          expect(result.response?.$case).toBe('invalidRequest')
        })
      })
    })

    describe('and joining a community voice chat', () => {
      describe('and voice chat is active and user is community member', () => {
        beforeEach(() => {
          // Override mocks for this specific scenario
          commsGatekeeperSpy.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: true,
            participantCount: 1,
            moderatorCount: 1
          })
        })

        it('should successfully join the community voice chat', async () => {
          const { rpcClient } = components

          const result = await rpcClient.client.joinCommunityVoiceChat({
            communityId
          })

          // Verify DB interactions occurred in correct order
          expect(commsGatekeeperSpy.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
          expect(communitiesDbSpy.getCommunity).toHaveBeenCalledWith(communityId, rpcClient.authAddress.toLowerCase())

          // For public communities, role check should happen when the community is private
          // Since our test community is public (private: false), the isMemberBanned check should be called
          expect(communitiesDbSpy.isMemberBanned).toHaveBeenCalledWith(communityId, rpcClient.authAddress.toLowerCase())

          // Verify external service calls
          expect(commsGatekeeperSpy.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
            communityId,
            rpcClient.authAddress.toLowerCase(),
            CommunityRole.Owner,
            expect.objectContaining({
              name: 'testuser',
              has_claimed_name: true,
              profile_picture_url: 'https://test.com/face.png'
            })
          )

          expect(result.response?.$case).toBe('ok')
          if (result.response?.$case === 'ok') {
            expect(result.response.ok.credentials?.connectionUrl).toBe(
              'livekit:wss://voice.test.decentraland.org?access_token=test-token'
            )
          }
        })
      })

      describe('and community voice chat is not active', () => {
        beforeEach(() => {
          // Override mock for this specific scenario (default is already false, but being explicit)
          commsGatekeeperSpy.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: false,
            participantCount: 0,
            moderatorCount: 0
          })
        })

        it('should fail with not found error', async () => {
          const { rpcClient } = components

          const result = await rpcClient.client.joinCommunityVoiceChat({
            communityId
          })

          // Verify the voice chat status was checked
          expect(commsGatekeeperSpy.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)

          // Should not proceed to other checks if voice chat is not active
          expect(commsGatekeeperSpy.getCommunityVoiceChatCredentials).not.toHaveBeenCalled()

          expect(result.response?.$case).toBe('notFoundError')
        })
      })

      describe('and community does not exist', () => {
        beforeEach(() => {
          // Override mock for this specific scenario
          commsGatekeeperSpy.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: true,
            participantCount: 1,
            moderatorCount: 1
          })
        })

        it('should fail with not found or forbidden error', async () => {
          const { rpcClient } = components
          const nonExistentCommunityId = '00000000-0000-0000-0000-000000000000'

          const result = await rpcClient.client.joinCommunityVoiceChat({
            communityId: nonExistentCommunityId
          })

          // Verify the voice chat status was checked first
          expect(commsGatekeeperSpy.getCommunityVoiceChatStatus).toHaveBeenCalledWith(nonExistentCommunityId)

          // If voice chat is active, it will proceed to check the community
          // The getCommunity call should return null for non-existent community
          expect(communitiesDbSpy.getCommunity).toHaveBeenCalledWith(
            nonExistentCommunityId,
            rpcClient.authAddress.toLowerCase()
          )

          // Should fail with either notFoundError or forbiddenError (both are valid for non-existent communities)
          expect(['notFoundError', 'forbiddenError']).toContain(result.response?.$case)
        })
      })
    })

    describe('when promoting speaker in community voice chat', () => {
      describe('when user is community owner', () => {
        beforeEach(() => {
          // Mock successful external service responses
          commsGatekeeperSpy.promoteSpeakerInCommunityVoiceChat = jest
            .spyOn(components.commsGatekeeper, 'promoteSpeakerInCommunityVoiceChat')
            .mockResolvedValue(undefined)
        })

        afterEach(() => {
          commsGatekeeperSpy.promoteSpeakerInCommunityVoiceChat?.mockRestore?.()
        })

        it('should successfully promote speaker', async () => {
          const { rpcClient } = components
          const targetMemberAddress = '0x456789abcdef123456789abcdef123456789abcde'

          // Add target user as a member
          await components.communitiesDb.addCommunityMember({
            communityId,
            memberAddress: targetMemberAddress.toLowerCase(),
            role: CommunityRole.Member
          })

          const result = await rpcClient.client.promoteSpeakerInCommunityVoiceChat({
            communityId,
            userAddress: targetMemberAddress
          })

          // Verify DB interactions occurred
          expect(communitiesDbSpy.getCommunityMemberRole).toHaveBeenCalledWith(
            communityId,
            rpcClient.authAddress.toLowerCase()
          )
          expect(communitiesDbSpy.getCommunityMemberRole).toHaveBeenCalledWith(communityId, targetMemberAddress)

          // Verify external service calls
          expect(commsGatekeeperSpy.promoteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
            communityId,
            targetMemberAddress
          )

          // Verify successful response
          expect(result.response?.$case).toBe('ok')
          if (result.response?.$case === 'ok') {
            expect(result.response.ok.message).toBe('User promoted to speaker successfully')
          }

          // Cleanup
          await components.communitiesDb.kickMemberFromCommunity(communityId, targetMemberAddress.toLowerCase())
        })
      })
    })

    describe('when kicking player from community voice chat', () => {
      describe('when user is community owner', () => {
        beforeEach(() => {
          // Mock successful external service responses
          commsGatekeeperSpy.kickUserFromCommunityVoiceChat = jest
            .spyOn(components.commsGatekeeper, 'kickUserFromCommunityVoiceChat')
            .mockResolvedValue(undefined)
        })

        afterEach(() => {
          commsGatekeeperSpy.kickUserFromCommunityVoiceChat?.mockRestore?.()
        })

        it('should successfully kick player', async () => {
          const { rpcClient } = components
          const targetMemberAddress = '0x456789abcdef123456789abcdef123456789abcde'

          // Add target user as a member
          await components.communitiesDb.addCommunityMember({
            communityId,
            memberAddress: targetMemberAddress.toLowerCase(),
            role: CommunityRole.Member
          })

          const result = await rpcClient.client.kickPlayerFromCommunityVoiceChat({
            communityId,
            userAddress: targetMemberAddress
          })

          // Verify DB interactions occurred
          expect(communitiesDbSpy.getCommunityMemberRole).toHaveBeenCalledWith(
            communityId,
            rpcClient.authAddress.toLowerCase()
          )
          expect(communitiesDbSpy.getCommunityMemberRole).toHaveBeenCalledWith(communityId, targetMemberAddress)

          // Verify external service calls
          expect(commsGatekeeperSpy.kickUserFromCommunityVoiceChat).toHaveBeenCalledWith(
            communityId,
            targetMemberAddress
          )

          // Verify successful response
          expect(result.response?.$case).toBe('ok')
          if (result.response?.$case === 'ok') {
            expect(result.response.ok.message).toBe('User kicked from voice chat successfully')
          }

          // Cleanup
          await components.communitiesDb.kickMemberFromCommunity(communityId, targetMemberAddress.toLowerCase())
        })
      })
    })
  })

  describe('when getting friendship status', function () {
    describe('and a friendship request exists', () => {
      let friendAddress: string
      let friendshipId: string

      beforeEach(async () => {
        const { friendsDb, rpcClient } = components
        friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
        friendshipId = await createPendingFriendshipRequest(friendsDb, [rpcClient.authAddress, friendAddress])
      })

      afterEach(async () => {
        const { friendsDb, rpcClient } = components
        await removeFriendship(friendsDb, friendshipId, rpcClient.authAddress)
      })

      it('should return friendship status successfully', async () => {
        const { rpcClient } = components

        const result = await rpcClient.client.getFriendshipStatus({
          user: { address: friendAddress }
        })

        expect(result.response?.$case).toBe('accepted')
        if (result.response?.$case === 'accepted') {
          expect(result.response.accepted.status).toBeDefined()
        }
      })
    })

    describe('and user address is missing', () => {
      it('should return invalid request when user address is missing', async () => {
        const { rpcClient } = components

        const result = await rpcClient.client.getFriendshipStatus({
          user: undefined
        })

        assertInvalidRequestCase(result, 'User address is missing in the request payload')
      })
    })

    describe('and user address is invalid', () => {
      it('should return invalid request when user address is invalid', async () => {
        const { rpcClient } = components

        const result = await rpcClient.client.getFriendshipStatus({
          user: { address: 'invalid-address' }
        })

        assertInvalidRequestCase(result, 'Invalid user address in the request payload')
      })
    })

    describe('and no friendship exists', () => {
      it('should return NONE status when no friendship exists', async () => {
        const { rpcClient } = components
        const nonFriendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'

        const result = await rpcClient.client.getFriendshipStatus({
          user: { address: nonFriendAddress }
        })

        expect(result.response?.$case).toBe('accepted')
        if (result.response?.$case === 'accepted') {
          expect(result.response.accepted.status).toBe(0) // NONE status
        }
      })
    })
  })

  describe('when upserting a friendship', function () {
    describe('and creating a friendship request', () => {
      let friendAddress: string
      let friendshipId: string | null = null

      beforeEach(() => {
        friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      })

      afterEach(async () => {
        if (friendshipId) {
          const { friendsDb, rpcClient } = components
          await removeFriendship(friendsDb, friendshipId, rpcClient.authAddress)
        }
      })

      it('should create friendship request successfully', async () => {
        const { rpcClient, friendsDb } = components

        const result = await rpcClient.client.upsertFriendship({
          action: {
            $case: 'request',
            request: {
              user: { address: friendAddress },
              message: "Hello, let's be friends!"
            }
          }
        })

        expect(result.response?.$case).toBe('accepted')
        if (result.response?.$case === 'accepted') {
          expect(result.response.accepted.friend.address).toBe(friendAddress)
          expect(result.response.accepted.message).toBe("Hello, let's be friends!")
        }

        // Store friendship ID for cleanup
        const friendship = await friendsDb.getFriendship([rpcClient.authAddress, friendAddress])
        if (friendship) {
          friendshipId = friendship.id
        }
      })
    })

    describe('and sending request to self', () => {
      it('should return invalid friendship action when sending request to self', async () => {
        const { rpcClient } = components

        const result = await rpcClient.client.upsertFriendship({
          action: {
            $case: 'request',
            request: {
              user: { address: rpcClient.authAddress },
              message: 'Hello'
            }
          }
        })

        expect(result.response?.$case).toBe('invalidFriendshipAction')
        if (result.response?.$case === 'invalidFriendshipAction') {
          expect(result.response.invalidFriendshipAction.message).toBe(
            'You cannot send a friendship request to yourself'
          )
        }
      })
    })

    describe('and user address is invalid', () => {
      it('should return invalid request when user address is invalid', async () => {
        const { rpcClient } = components

        const result = await rpcClient.client.upsertFriendship({
          action: {
            $case: 'request',
            request: {
              user: { address: 'invalid-address' },
              message: 'Hello'
            }
          }
        })

        assertInvalidRequestCase(result, 'Invalid user address in the request payload')
      })
    })

    describe('and accepting a friendship request', () => {
      let friendAddress: string
      let friendshipId: string

      beforeEach(async () => {
        const { friendsDb, rpcClient } = components
        friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
        friendshipId = await createPendingFriendshipRequest(friendsDb, [friendAddress, rpcClient.authAddress])
      })

      afterEach(async () => {
        const { friendsDb, rpcClient } = components
        await removeFriendship(friendsDb, friendshipId, friendAddress)
      })

      it('should accept friendship request successfully', async () => {
        const { rpcClient } = components

        const result = await rpcClient.client.upsertFriendship({
          action: {
            $case: 'accept',
            accept: {
              user: { address: friendAddress }
            }
          }
        })

        expect(result.response?.$case).toBe('accepted')
        if (result.response?.$case === 'accepted') {
          expect(result.response.accepted.friend.address).toBe(friendAddress)
        }
      })
    })
  })

  describe('when getting mutual friends v2', function () {
    describe('and mutual friends exist', () => {
      let friendAddress: string
      let mutualFriendAddress: string
      let friendshipIds: string[]

      beforeEach(async () => {
        const { friendsDb, rpcClient } = components
        friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
        mutualFriendAddress = '0x77c4c17331436d3b8798596e3d7c0d8e1b786aa4'
        const mockMutualFriendProfile = createMockProfile(mutualFriendAddress)

        stubComponents.catalystClient.getProfiles.resolves([mockMutualFriendProfile])

        const id1 = await createOrUpsertActiveFriendship(friendsDb, [rpcClient.authAddress, friendAddress])
        const id2 = await createOrUpsertActiveFriendship(friendsDb, [rpcClient.authAddress, mutualFriendAddress])
        const id3 = await createOrUpsertActiveFriendship(friendsDb, [friendAddress, mutualFriendAddress])
        friendshipIds = [id1, id2, id3]
      })

      afterEach(async () => {
        const { friendsDb, rpcClient } = components
        await removeFriendship(friendsDb, friendshipIds[0], rpcClient.authAddress)
        await removeFriendship(friendsDb, friendshipIds[1], rpcClient.authAddress)
        await removeFriendship(friendsDb, friendshipIds[2], friendAddress)
      })

      it('should return mutual friends successfully', async () => {
        const { rpcClient } = components

        const response = await rpcClient.client.getMutualFriendsV2({
          user: {
            address: friendAddress
          },
          pagination: {
            limit: 10,
            offset: 0
          }
        })

        expect(response.response?.$case).toBe('ok')
        if (response.response?.$case === 'ok') {
          expect(response.response.ok.friends).toHaveLength(1)
          expect(response.response.ok.friends[0].address).toEqual(mutualFriendAddress)
          expect(response.response.ok.paginationData.total).toBe(1)
        }
      })
    })

    describe('and no mutual friends exist', () => {
      let friendAddress: string
      let friendshipId: string

      beforeEach(async () => {
        const { friendsDb, rpcClient } = components
        friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
        friendshipId = await createOrUpsertActiveFriendship(friendsDb, [rpcClient.authAddress, friendAddress])

        stubComponents.catalystClient.getProfiles.resolves([])
      })

      afterEach(async () => {
        const { friendsDb, rpcClient } = components
        await removeFriendship(friendsDb, friendshipId, rpcClient.authAddress)
      })

      it('should return empty list when no mutual friends exist', async () => {
        const { rpcClient } = components

        const response = await rpcClient.client.getMutualFriendsV2({
          user: {
            address: friendAddress
          },
          pagination: {
            limit: 10,
            offset: 0
          }
        })

        expect(response.response?.$case).toBe('ok')
        if (response.response?.$case === 'ok') {
          expect(response.response.ok.friends).toHaveLength(0)
          expect(response.response.ok.paginationData.total).toBe(0)
        }
      })
    })

    describe('and user address is missing', () => {
      it('should return invalid request when user address is missing', async () => {
        const { rpcClient } = components

        const response = await rpcClient.client.getMutualFriendsV2({
          user: undefined,
          pagination: {
            limit: 10,
            offset: 0
          }
        })

        assertInvalidRequestCase(response, 'User address is missing in the request payload')
      })
    })

    describe('and user address is invalid', () => {
      it('should return invalid request when user address is invalid', async () => {
        const { rpcClient } = components

        const response = await rpcClient.client.getMutualFriendsV2({
          user: { address: 'invalid-address' },
          pagination: {
            limit: 10,
            offset: 0
          }
        })

        assertInvalidRequestCase(response, 'Invalid user address in the request payload')
      })
    })
  })

  // Assert ok case
  function assertOkCase<T>(result: { response?: { $case: string; ok?: T } | undefined }, expectedResult: T) {
    expect(result?.response?.$case).toEqual('ok')
    expect(result?.response?.ok).toEqual(expectedResult)
  }

  function assertInvalidRequestCase(
    result: { response?: { $case: string; invalidRequest?: { message?: string } } | undefined },
    expectedMessage: string
  ) {
    expect(result?.response?.$case).toEqual('invalidRequest')
    expect(result.response?.invalidRequest?.message).toEqual(expectedMessage)
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
    expectefriendsDblockedUser: BlockedUserProfile,
    expectefriendsDblockedAt?: number
  ) {
    expect(result.response.$case).toEqual('ok')
    if (result.response.$case === 'ok') {
      expect(result.response.ok.profile).toEqual({
        ...expectefriendsDblockedUser,
        blockedAt: expectefriendsDblockedAt
      })
    }
  }
})
