import { CommunityRole, Action } from '../../src/types/entities'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { v4 as uuidv4 } from 'uuid'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createOrUpsertActiveFriendship, removeFriendship } from './utils/friendships'
import { Response } from '@well-known-components/interfaces'

const PROFILE_FIELDS = ['name', 'profilePictureUrl', 'hasClaimedName', 'nameColor']

test('Get Banned Members Controller v2', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let identity: Identity
  let addressMakingRequest: string
  let communityId: string

  beforeEach(async () => {
    identity = await createTestIdentity()
    addressMakingRequest = identity.realAccount.address.toLowerCase()
    communityId = uuidv4()
  })

  describe('when getting banned members (v2)', () => {
    const bannedAddress = '0x0000000000000000000000000000000000000002'
    let friendshipId: string

    beforeEach(async () => {
      communityId = (
        await components.communitiesDb.createCommunity({
          name: 'Test Community',
          description: 'Test Description',
          private: false,
          active: true,
          unlisted: false,
          owner_address: addressMakingRequest
        })
      ).id

      // The requester is the owner so they have permission to view bans.
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: addressMakingRequest,
        role: CommunityRole.Owner
      })

      await components.communitiesDb.banMemberFromCommunity(communityId, addressMakingRequest, bannedAddress)

      friendshipId = await createOrUpsertActiveFriendship(components.friendsDb, [addressMakingRequest, bannedAddress])
      await components.friendsDb.recordFriendshipAction(friendshipId, addressMakingRequest, Action.ACCEPT, null)

      spyComponents.registry.getProfiles.mockResolvedValue([])
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [addressMakingRequest, bannedAddress])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      await removeFriendship(components.friendsDb, friendshipId, addressMakingRequest)
    })

    describe('when the request is signed by a user with permission', () => {
      let response: Response

      beforeEach(async () => {
        response = await makeRequest(identity, `/v2/communities/${communityId}/bans`)
      })

      it('should return the banned member addresses with a 200 status code', async () => {
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.data.results).toEqual([
          expect.objectContaining({
            communityId,
            memberAddress: bannedAddress,
            bannedAt: expect.any(String),
            friendshipStatus: FriendshipStatus.ACCEPTED
          })
        ])
      })

      it('should not include any profile information in the banned members', async () => {
        const result = await response.json()
        for (const member of result.data.results) {
          for (const field of PROFILE_FIELDS) {
            expect(member).not.toHaveProperty(field)
          }
        }
      })

      it('should not leak the internal friendship-action fields', async () => {
        const result = await response.json()
        // the banned member has an accepted friendship, so these fields exist on the DB row
        for (const member of result.data.results) {
          expect(member).not.toHaveProperty('lastFriendshipAction')
          expect(member).not.toHaveProperty('actingUser')
        }
      })

      it('should not call the registry to fetch profiles', async () => {
        expect(spyComponents.registry.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe('when the request is signed by a user without permission', () => {
      let otherIdentity: Identity

      beforeEach(async () => {
        otherIdentity = await createTestIdentity()
      })

      it('should respond with a 401 status code', async () => {
        const response = await makeRequest(otherIdentity, `/v2/communities/${communityId}/bans`)
        expect(response.status).toBe(401)
      })
    })

    describe('when the community does not exist', () => {
      it('should respond with a 404 status code', async () => {
        const nonExistentCommunityId = uuidv4()
        const response = await makeRequest(identity, `/v2/communities/${nonExistentCommunityId}/bans`)
        expect(response.status).toBe(404)
      })
    })

    describe('when the underlying fetch fails', () => {
      beforeEach(() => {
        spyComponents.communityBans.getBannedMembersWithoutProfiles.mockRejectedValue(
          new Error('Unable to get banned members')
        )
      })

      it('should respond with a 500 status code', async () => {
        const response = await makeRequest(identity, `/v2/communities/${communityId}/bans`)
        expect(response.status).toBe(500)
      })
    })
  })
})
