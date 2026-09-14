import { CommunityRequestType } from '../../src/logic/community'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'
import { CommunityRole } from '../../src/types'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

const PROFILE_FIELDS = ['name', 'profilePictureUrl', 'hasClaimedName', 'nameColor']

test('Get Community Requests Controller v2', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let ownerIdentity: Identity
  let ownerAddress: string
  let communityId: string

  beforeEach(async () => {
    ownerIdentity = await createTestIdentity()
    ownerAddress = ownerIdentity.realAccount.address.toLowerCase()
  })

  describe('when getting community requests (v2) as the community owner', () => {
    const memberAddress = '0x1111111111111111111111111111111111111111'
    let response: Response

    beforeEach(async () => {
      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'Test Description',
          owner_address: ownerAddress,
          private: true
        })
      )
      communityId = result.id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerAddress,
        role: CommunityRole.Owner
      })

      await components.communitiesDb.createCommunityRequest(communityId, memberAddress, CommunityRequestType.RequestToJoin)

      spyComponents.registry.getProfiles.mockResolvedValue([])

      response = await makeRequest(ownerIdentity, `/v2/communities/${communityId}/requests`)
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [ownerAddress])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    it('should return the requests with the member address and a 200 status code', async () => {
      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.data.results).toEqual([
        expect.objectContaining({
          communityId,
          memberAddress,
          type: CommunityRequestType.RequestToJoin,
          status: 'pending',
          friendshipStatus: FriendshipStatus.NONE
        })
      ])
    })

    it('should not include any profile information in the requests', async () => {
      const result = await response.json()
      for (const request of result.data.results) {
        for (const field of PROFILE_FIELDS) {
          expect(request).not.toHaveProperty(field)
        }
      }
    })

    it('should not call the registry to fetch profiles', async () => {
      expect(spyComponents.registry.getProfiles).not.toHaveBeenCalled()
    })
  })

  describe('when getting community requests (v2) as a non-member', () => {
    let otherIdentity: Identity

    beforeEach(async () => {
      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'Test Description',
          owner_address: ownerAddress,
          private: true
        })
      )
      communityId = result.id
      otherIdentity = await createTestIdentity()
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    it('should respond with a 401 status code', async () => {
      const response = await makeRequest(otherIdentity, `/v2/communities/${communityId}/requests`)
      expect(response.status).toBe(401)
    })
  })

  describe('when getting community requests (v2) as a regular member', () => {
    let memberIdentity: Identity

    beforeEach(async () => {
      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'Test Description',
          owner_address: ownerAddress,
          private: true
        })
      )
      communityId = result.id
      memberIdentity = await createTestIdentity()
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: memberIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Member
      })
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [
        memberIdentity.realAccount.address.toLowerCase()
      ])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    it('should respond with a 401 status code', async () => {
      const response = await makeRequest(memberIdentity, `/v2/communities/${communityId}/requests`)
      expect(response.status).toBe(401)
    })
  })

  describe('when getting community requests (v2) as the owner and there are no requests', () => {
    beforeEach(async () => {
      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'Test Description',
          owner_address: ownerAddress,
          private: true
        })
      )
      communityId = result.id
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerAddress,
        role: CommunityRole.Owner
      })
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [ownerAddress])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    it('should return an empty, paginated result with a 200 status code', async () => {
      const response = await makeRequest(ownerIdentity, `/v2/communities/${communityId}/requests?limit=10&offset=0`)
      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.data.results).toEqual([])
      expect(result.data.total).toBe(0)
      expect(result.data.page).toBe(1)
      expect(result.data.pages).toBe(0)
    })

    it('should respond with a 500 status code when the underlying fetch fails', async () => {
      spyComponents.communityRequests.getCommunityRequests.mockRejectedValue(new Error('Unable to get requests'))
      const response = await makeRequest(ownerIdentity, `/v2/communities/${communityId}/requests`)
      expect(response.status).toBe(500)
    })
  })
})
