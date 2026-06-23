import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { Response } from '@well-known-components/interfaces'

test('Get Communities Controller v2', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let identity: Identity
  let address: string
  let communityId: string

  beforeEach(async () => {
    identity = await createTestIdentity()
    address = identity.realAccount.address.toLowerCase()
    spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValue({})
    spyComponents.registry.getProfiles.mockResolvedValue([])
  })

  describe('when getting communities (v2) with a signed request', () => {
    let response: Response

    beforeEach(async () => {
      const community = await components.communitiesDb.createCommunity({
        name: 'Test Community',
        description: 'Test Description',
        owner_address: address,
        private: false,
        active: true,
        unlisted: false
      })
      communityId = community.id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: address,
        role: CommunityRole.Owner
      })

      response = await makeRequest(identity, `/v2/communities`)
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [address])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    it('should return the community with the owner address but no owner name', async () => {
      expect(response.status).toBe(200)
      const body = await response.json()
      const community = body.data.results.find((c: any) => c.id === communityId)
      expect(community).toEqual(
        expect.objectContaining({
          id: communityId,
          name: 'Test Community',
          ownerAddress: address,
          role: CommunityRole.Owner
        })
      )
      expect(community).not.toHaveProperty('ownerName')
    })

    it('should return mutual friends as an array of addresses', async () => {
      const body = await response.json()
      const community = body.data.results.find((c: any) => c.id === communityId)
      expect(Array.isArray(community.friends)).toBe(true)
      for (const friend of community.friends) {
        expect(typeof friend).toBe('string')
      }
    })

    it('should not call the registry to resolve owner or friend profiles', async () => {
      expect(spyComponents.registry.getProfiles).not.toHaveBeenCalled()
      expect(spyComponents.communityOwners.getOwnersNames).not.toHaveBeenCalled()
    })
  })
})
