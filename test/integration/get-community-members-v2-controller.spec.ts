import { CommunityRole } from '../../src/types/entities'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { v4 as uuidv4 } from 'uuid'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createFriendshipRequest, removeFriendship } from './utils/friendships'

const PROFILE_FIELDS = ['name', 'profilePictureUrl', 'hasClaimedName', 'nameColor']

test('Get Community Members Controller v2', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let identity: Identity
  let addressMakingRequest: string
  let communityId: string

  beforeEach(async () => {
    identity = await createTestIdentity()
    addressMakingRequest = identity.realAccount.address.toLowerCase()
    communityId = uuidv4()
  })

  describe('when getting community members (v2)', () => {
    const ownerAddress = '0x0000000000000000000000000000000000000001'
    const firstMemberAddress = '0x0000000000000000000000000000000000000002'
    let friendshipId: string

    beforeEach(async () => {
      communityId = (
        await components.communitiesDb.createCommunity({
          name: 'Test Community',
          description: 'Test Description',
          private: false,
          active: true,
          unlisted: false,
          owner_address: '0x0000000000000000000000000000000000000000'
        })
      ).id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: firstMemberAddress,
        role: CommunityRole.Member
      })
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerAddress,
        role: CommunityRole.Owner
      })

      friendshipId = await createFriendshipRequest(components.friendsDb, [addressMakingRequest, firstMemberAddress])

      // No profiles are seeded on purpose: v2 must not fetch them.
      spyComponents.registry.getProfiles.mockResolvedValue([])
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [firstMemberAddress, ownerAddress])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      await removeFriendship(components.friendsDb, friendshipId, addressMakingRequest)
    })

    describe('when the request is signed and the community is public', () => {
      let response: Response

      beforeEach(async () => {
        response = await makeRequest(identity, `/v2/communities/${communityId}/members`)
      })

      it('should return all the members with their addresses and a 200 status code', async () => {
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.data.results).toEqual([
          expect.objectContaining({
            communityId,
            memberAddress: ownerAddress,
            role: CommunityRole.Owner,
            joinedAt: expect.any(String),
            friendshipStatus: FriendshipStatus.NONE
          }),
          expect.objectContaining({
            communityId,
            memberAddress: firstMemberAddress,
            role: CommunityRole.Member,
            joinedAt: expect.any(String),
            friendshipStatus: FriendshipStatus.REQUEST_SENT
          })
        ])
      })

      it('should not include any profile information in the members', async () => {
        const result = await response.json()
        for (const member of result.data.results) {
          for (const field of PROFILE_FIELDS) {
            expect(member).not.toHaveProperty(field)
          }
        }
      })

      it('should not leak the internal friendship-action fields', async () => {
        const result = await response.json()
        // firstMemberAddress has a pending friendship, so these fields exist on the DB row
        for (const member of result.data.results) {
          expect(member).not.toHaveProperty('lastFriendshipAction')
          expect(member).not.toHaveProperty('actingUser')
        }
      })

      it('should not call the registry to fetch profiles', async () => {
        expect(spyComponents.registry.getProfiles).not.toHaveBeenCalled()
      })

      it('should return every member even though no profile could be resolved', async () => {
        const result = await response.json()
        expect(result.data.total).toBe(2)
        expect(result.data.results).toHaveLength(2)
      })
    })

    describe('when the request is not signed and the community is private', () => {
      let privateCommunityId: string

      beforeEach(async () => {
        privateCommunityId = (
          await components.communitiesDb.createCommunity({
            name: 'Private Community',
            description: 'Private Description',
            private: true,
            unlisted: false,
            active: true,
            owner_address: '0x0000000000000000000000000000000000000000'
          })
        ).id
      })

      afterEach(async () => {
        await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityId)
      })

      it('should return a 404 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v2/communities/${privateCommunityId}/members`)
        expect(response.status).toBe(404)
      })
    })

    describe('when the request is signed but the user is not a member of a private community', () => {
      let privateCommunityId: string

      beforeEach(async () => {
        privateCommunityId = (
          await components.communitiesDb.createCommunity({
            name: 'Private Community',
            description: 'Private Description',
            private: true,
            unlisted: false,
            active: true,
            owner_address: ownerAddress
          })
        ).id
        await components.communitiesDb.addCommunityMember({
          communityId: privateCommunityId,
          memberAddress: ownerAddress,
          role: CommunityRole.Owner
        })
      })

      afterEach(async () => {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(privateCommunityId, [ownerAddress])
        await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityId)
      })

      it('should return a 401 status code', async () => {
        const response = await makeRequest(identity, `/v2/communities/${privateCommunityId}/members`)
        expect(response.status).toBe(401)
      })
    })

    describe('when the request is signed and only online members are requested', () => {
      let response: Response

      beforeEach(async () => {
        spyComponents.peersStats.getConnectedPeers.mockResolvedValue([firstMemberAddress])
        response = await makeRequest(identity, `/v2/communities/${communityId}/members?onlyOnline=true`)
      })

      it('should return only the online members with a 200 status code', async () => {
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.data.total).toBe(1)
        expect(result.data.results).toEqual([
          expect.objectContaining({
            communityId,
            memberAddress: firstMemberAddress,
            role: CommunityRole.Member,
            friendshipStatus: FriendshipStatus.REQUEST_SENT
          })
        ])
      })
    })

    describe('when an unsigned request carries a valid admin token for a private community', () => {
      let privateCommunityId: string

      beforeEach(async () => {
        privateCommunityId = (
          await components.communitiesDb.createCommunity({
            name: 'Private Community',
            description: 'Private Description',
            private: true,
            unlisted: false,
            active: true,
            owner_address: ownerAddress
          })
        ).id
        await components.communitiesDb.addCommunityMember({
          communityId: privateCommunityId,
          memberAddress: ownerAddress,
          role: CommunityRole.Owner
        })
      })

      afterEach(async () => {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(privateCommunityId, [ownerAddress])
        await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityId)
      })

      it('should bypass privacy and return the members with a 200 status code', async () => {
        const { localHttpFetch, config } = components
        const API_ADMIN_TOKEN = await config.getString('API_ADMIN_TOKEN')
        const response = await localHttpFetch.fetch(`/v2/communities/${privateCommunityId}/members`, {
          headers: { Authorization: `Bearer ${API_ADMIN_TOKEN}` }
        })
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.data.results).toEqual([
          expect.objectContaining({
            communityId: privateCommunityId,
            memberAddress: ownerAddress,
            role: CommunityRole.Owner
          })
        ])
      })
    })

    describe('when the underlying fetch fails', () => {
      beforeEach(() => {
        spyComponents.communityMembers.getCommunityMembersWithoutProfiles.mockRejectedValue(
          new Error('Unable to get community members')
        )
      })

      it('should respond with a 500 status code', async () => {
        const response = await makeRequest(identity, `/v2/communities/${communityId}/members`)
        expect(response.status).toBe(500)
      })
    })
  })
})
