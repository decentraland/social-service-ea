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

    it('should accept a roles filter and return the matching community with a 200 status code', async () => {
      const response = await makeRequest(identity, `/v2/communities?roles=owner`)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.data.results.find((c: any) => c.id === communityId)).toEqual(
        expect.objectContaining({ id: communityId, ownerAddress: address, role: CommunityRole.Owner })
      )
    })
  })

  describe('when getting communities (v2) without signing the request', () => {
    const publicOwnerAddress = '0x0000000000000000000000000000000000000abc'

    beforeEach(async () => {
      const community = await components.communitiesDb.createCommunity({
        name: 'Public Listed Community',
        description: 'Test Description',
        owner_address: publicOwnerAddress,
        private: false,
        active: true,
        unlisted: false
      })
      communityId = community.id
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    it('should return the public community with the owner address but no owner name', async () => {
      const { localHttpFetch } = components
      const response = await localHttpFetch.fetch(`/v2/communities`)
      expect(response.status).toBe(200)
      const body = await response.json()
      const community = body.data.results.find((c: any) => c.id === communityId)
      expect(community).toEqual(expect.objectContaining({ id: communityId, ownerAddress: publicOwnerAddress }))
      expect(community).not.toHaveProperty('ownerName')
    })

    it('should not call the registry to resolve owner profiles', async () => {
      const { localHttpFetch } = components
      await localHttpFetch.fetch(`/v2/communities`)
      expect(spyComponents.communityOwners.getOwnersNames).not.toHaveBeenCalled()
    })
  })

  describe('when getting communities (v2) with the minimal flag', () => {
    describe('and the request is not signed', () => {
      it('should respond with a 401 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v2/communities?minimal=true`)
        expect(response.status).toBe(401)
      })
    })

    describe('and the search query is too short', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, `/v2/communities?minimal=true&search=ab`)
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is valid', () => {
      beforeEach(() => {
        spyComponents.communities.searchCommunities.mockResolvedValue({
          communities: [{ id: 'minimal-id', name: 'Minimal Community', membersCount: 3, privacy: 'public' as any }],
          total: 1
        })
      })

      it('should return the minimal (profile-free) search results with a 200 status code', async () => {
        const response = await makeRequest(identity, `/v2/communities?minimal=true&search=test`)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.results).toEqual([
          { id: 'minimal-id', name: 'Minimal Community', membersCount: 3, privacy: 'public' }
        ])
        expect(body.data.total).toBe(1)
      })
    })
  })

  describe('when getting communities (v2) and the underlying fetch fails', () => {
    beforeEach(() => {
      spyComponents.communities.getCommunitiesWithoutProfiles.mockRejectedValue(new Error('Unable to get communities'))
    })

    it('should respond with a 500 status code', async () => {
      const response = await makeRequest(identity, `/v2/communities`)
      expect(response.status).toBe(500)
    })
  })
})
