import { CommunityPrivacyEnum } from '../../src/logic/community'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

test('Get Community Controller v2', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let communityId: string
  let address: string
  let identity: Identity

  beforeEach(async () => {
    identity = await createTestIdentity()
    address = identity.realAccount.address.toLowerCase()
    spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
      isActive: true,
      participantCount: 2,
      moderatorCount: 1
    })
    // Make the registry blow up to prove the v2 path never calls it.
    spyComponents.registry.getProfile.mockRejectedValue(new Error('registry should not be called'))
    spyComponents.registry.getProfiles.mockRejectedValue(new Error('registry should not be called'))
  })

  afterEach(async () => {
    if (communityId) {
      await components.communitiesDb.deleteCommunity(communityId)
    }
  })

  describe('when getting a community (v2) without signing the request', () => {
    beforeEach(async () => {
      const { id } = await components.communitiesDb.createCommunity({
        name: 'Test Community',
        description: 'Test Description',
        owner_address: address,
        private: false,
        active: true,
        unlisted: false
      })
      communityId = id
    })

    it('should respond with a 200 status code and the owner address but no owner name', async () => {
      const { localHttpFetch } = components
      const response = await localHttpFetch.fetch(`/v2/communities/${communityId}`)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.data).toEqual(
        expect.objectContaining({
          id: communityId,
          name: 'Test Community',
          ownerAddress: address,
          privacy: CommunityPrivacyEnum.Public,
          active: true
        })
      )
      expect(body.data).not.toHaveProperty('ownerName')
    })

    it('should not call the registry to resolve the owner profile', async () => {
      const { localHttpFetch } = components
      await localHttpFetch.fetch(`/v2/communities/${communityId}`)
      expect(spyComponents.registry.getProfile).not.toHaveBeenCalled()
      expect(spyComponents.registry.getProfiles).not.toHaveBeenCalled()
    })
  })

  describe('when getting a community (v2) with a signed request', () => {
    beforeEach(async () => {
      const { id } = await components.communitiesDb.createCommunity({
        name: 'Test Community',
        description: 'Test Description',
        owner_address: address,
        private: false,
        active: true,
        unlisted: false
      })
      communityId = id
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: address,
        role: 'owner' as any
      })
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [address])
    })

    it('should respond with a 200 status code, the owner address, the role and no owner name', async () => {
      const response = await makeRequest(identity, `/v2/communities/${communityId}`)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.data).toEqual(
        expect.objectContaining({
          id: communityId,
          ownerAddress: address,
          role: 'owner'
        })
      )
      expect(body.data).not.toHaveProperty('ownerName')
    })
  })
})
