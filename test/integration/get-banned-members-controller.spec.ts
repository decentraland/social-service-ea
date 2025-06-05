import { Action, CommunityRole } from '../../src/types/entities'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { v4 as uuidv4 } from 'uuid'
import { createMockProfile } from '../mocks/profile'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createFriendshipRequest, createOrUpsertActiveFriendship, removeFriendship } from './utils/friendships'

test('Get Banned Members Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let identity: Identity
  let addressMakingRequest: string
  let communityId: string

  beforeEach(async () => {
    identity = await createTestIdentity()
    addressMakingRequest = identity.realAccount.address.toLowerCase()
    communityId = uuidv4()
  })

  describe('when community does not exists', () => {
    it('should respond with a 404 status code', async () => {
      const response = await makeRequest(identity, `/v1/communities/${communityId}/bans`)
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: 'Not Found',
        message: `Community not found: ${communityId}`
      })
    })
  })

  describe('when community exists and has banned members', () => {
    const ownerAddress = '0x0000000000000000000000000000000000000001'
    const firstBannedAddress = '0x0000000000000000000000000000000000000002'
    const secondBannedAddress = '0x0000000000000000000000000000000000000003'
    let firstFriendshipId: string
    let secondFriendshipId: string

    beforeEach(async () => {
      communityId = (
        await components.communitiesDb.createCommunity({
          name: 'Test Community',
          description: 'Test Description',
          private: false,
          active: true,
          owner_address: ownerAddress
        })
      ).id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerAddress,
        role: CommunityRole.Owner
      })

      await components.communitiesDb.banMemberFromCommunity(communityId, ownerAddress, firstBannedAddress)
      await components.communitiesDb.banMemberFromCommunity(communityId, ownerAddress, secondBannedAddress)

      // First banned member: REQUEST_SENT status (requesting user sends request)
      firstFriendshipId = await createFriendshipRequest(components.friendsDb, [
        addressMakingRequest,
        firstBannedAddress
      ])

      // Second banned member: ACCEPTED status (requesting user accepts request)
      secondFriendshipId = await createOrUpsertActiveFriendship(components.friendsDb, [
        addressMakingRequest,
        secondBannedAddress
      ])

      await components.friendsDb.recordFriendshipAction(firstFriendshipId, addressMakingRequest, Action.ACCEPT, null)
      await components.friendsDb.recordFriendshipAction(secondFriendshipId, addressMakingRequest, Action.ACCEPT, null)
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [
        firstBannedAddress,
        secondBannedAddress,
        ownerAddress
      ])
      await removeFriendship(components.friendsDb, firstFriendshipId, addressMakingRequest)
      await removeFriendship(components.friendsDb, secondFriendshipId, addressMakingRequest)
    })

    describe('but the user is not a member of the community', () => {
      it('should respond with a 401 status code', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/bans`)
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({
          error: 'Not Authorized',
          message: "The user doesn't have permission to get banned members"
        })
      })
    })

    describe('and the user is a member without ban permissions', () => {
      beforeEach(async () => {
        await components.communitiesDb.addCommunityMember({
          communityId,
          memberAddress: addressMakingRequest,
          role: CommunityRole.Member
        })
      })

      afterEach(async () => {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [addressMakingRequest])
      })

      it('should respond with a 401 status code', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/bans`)
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({
          error: 'Not Authorized',
          message: "The user doesn't have permission to get banned members"
        })
      })
    })

    describe('and the user has ban permissions', () => {
      beforeEach(async () => {
        // Setup community and member roles
        await components.communitiesDb.addCommunityMember({
          communityId,
          memberAddress: addressMakingRequest,
          role: CommunityRole.Moderator
        })

        // Setup profiles
        spyComponents.catalystClient.getProfiles.mockResolvedValue([
          createMockProfile(firstBannedAddress),
          createMockProfile(secondBannedAddress)
        ])
      })

      afterEach(async () => {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [addressMakingRequest])
      })

      it('should respond with a 200 status code and the correct banned members', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/bans`)
        expect(response.status).toBe(200)
        const result = await response.json()

        expect(result.data.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              communityId,
              memberAddress: firstBannedAddress,
              hasClaimedName: true,
              bannedAt: expect.any(String),
              name: `Profile name ${firstBannedAddress}`,
              profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
              friendshipStatus: FriendshipStatus.ACCEPTED
            }),
            expect.objectContaining({
              communityId,
              memberAddress: secondBannedAddress,
              hasClaimedName: true,
              bannedAt: expect.any(String),
              name: `Profile name ${secondBannedAddress}`,
              profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
              friendshipStatus: FriendshipStatus.ACCEPTED
            })
          ])
        )
      })

      it('should handle pagination correctly', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/bans?limit=1&page=1`)
        expect(response.status).toBe(200)
        const result = await response.json()

        expect(result.data.results).toHaveLength(1)
        expect(result.data.limit).toBe(1)
        expect(result.data.page).toBe(1)
      })
    })
  })
})
