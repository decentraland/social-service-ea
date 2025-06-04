import { CommunityRole } from '../../src/types/entities'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { v4 as uuidv4 } from 'uuid'
import { createMockProfile } from '../mocks/profile'
import { Action } from '../../src/types/entities'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createFriendshipRequest, createOrUpsertActiveFriendship } from './utils/friendships'
import { removeFriendship } from './utils/friendships'

test('Get Community Members Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let identity: Identity
  let addressMakingRequest: string
  let communityId

  beforeEach(async () => {
    identity = await createTestIdentity()
    addressMakingRequest = identity.realAccount.address.toLowerCase()
    communityId = uuidv4()
  })

  describe('when community does not exists', () => {
    it('should respond with a 404 status code', async () => {
      const response = await makeRequest(identity, `/v1/communities/${communityId}/members`)
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: 'Not Found',
        message: `Community not found: ${communityId}`
      })
    })
  })

  describe('when community exists and has members', () => {
    const ownerAddress = '0x0000000000000000000000000000000000000001'
    const firstMemberAddress = '0x0000000000000000000000000000000000000002'
    const secondMemberAddress = '0x0000000000000000000000000000000000000003'
    let firstFriendshipId: string
    let secondFriendshipId: string

    beforeEach(async () => {
      communityId = (
        await components.communitiesDb.createCommunity({
          name: 'Test Community',
          description: 'Test Description',
          private: false,
          active: true,
          owner_address: '0x0000000000000000000000000000000000000000'
        })
      ).id

      // Add members to community
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: firstMemberAddress,
        role: CommunityRole.Member
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: secondMemberAddress,
        role: CommunityRole.Member
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerAddress,
        role: CommunityRole.Owner
      })

      // Create friendship requests using utility functions and store IDs
      firstFriendshipId = await createFriendshipRequest(components.friendsDb, [
        addressMakingRequest,
        firstMemberAddress
      ])
      secondFriendshipId = await createOrUpsertActiveFriendship(components.friendsDb, [
        secondMemberAddress,
        addressMakingRequest
      ])
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [
        firstMemberAddress,
        secondMemberAddress,
        ownerAddress
      ])

      // Clean up friendship data using removeFriendship
      await removeFriendship(components.friendsDb, firstFriendshipId, addressMakingRequest)
      await removeFriendship(components.friendsDb, secondFriendshipId, addressMakingRequest)
    })

    describe('but the user is not a member of the community', () => {
      it('should respond with a 401 status code', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/members`)
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({
          error: 'Not Authorized',
          message: "The user doesn't have permission to get community members"
        })
      })
    })

    describe('and the request is made by a member of the community', () => {
      beforeEach(async () => {
        spyComponents.catalystClient.getProfiles.mockResolvedValue([
          createMockProfile(firstMemberAddress),
          createMockProfile(secondMemberAddress),
          createMockProfile(ownerAddress),
          {
            ...createMockProfile(addressMakingRequest),
            avatars: [
              {
                ...createMockProfile(addressMakingRequest).avatars[0],
                hasClaimedName: false,
                name: '',
                unclaimedName: 'Test User 4'
              }
            ]
          }
        ])

        await components.communitiesDb.addCommunityMember({
          communityId,
          memberAddress: addressMakingRequest,
          role: CommunityRole.Member
        })
      })

      afterEach(async () => {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [addressMakingRequest])
      })

      it('should respond with a 200 status code and the correct members including friendship status', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/members`)
        expect(response.status).toBe(200)
        const result = await response.json()

        expect(result.data.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              communityId,
              memberAddress: firstMemberAddress,
              hasClaimedName: true,
              joinedAt: expect.any(String),
              name: `Profile name ${firstMemberAddress}`,
              role: 'member',
              profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
              friendshipStatus: FriendshipStatus.REQUEST_SENT
            }),
            expect.objectContaining({
              communityId,
              memberAddress: secondMemberAddress,
              hasClaimedName: true,
              joinedAt: expect.any(String),
              name: `Profile name ${secondMemberAddress}`,
              role: 'member',
              profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
              friendshipStatus: FriendshipStatus.ACCEPTED
            }),
            expect.objectContaining({
              communityId,
              memberAddress: ownerAddress,
              hasClaimedName: true,
              joinedAt: expect.any(String),
              name: `Profile name ${ownerAddress}`,
              role: 'owner',
              profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
              friendshipStatus: FriendshipStatus.NONE
            })
          ])
        )
      })

      it('should return with a 200 and the correct members with friendship status when the request is made with pagination', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/members?limit=2&page=1`)
        expect(response.status).toBe(200)
        const result = await response.json()

        expect(result.data.results).toHaveLength(2)
        expect(result.data.results[0]).toEqual(
          expect.objectContaining({
            communityId,
            memberAddress: firstMemberAddress,
            hasClaimedName: true,
            joinedAt: expect.any(String),
            name: `Profile name ${firstMemberAddress}`,
            role: 'member',
            profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
            friendshipStatus: FriendshipStatus.REQUEST_SENT
          })
        )
      })

      it('should handle members with no friendship status correctly', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/members`)
        expect(response.status).toBe(200)
        const result = await response.json()

        console.log(result.data.results)

        const owner = result.data.results.find((m) => m.memberAddress === ownerAddress)
        expect(owner.friendshipStatus).toBe(FriendshipStatus.NONE)
      })
    })
  })
})
