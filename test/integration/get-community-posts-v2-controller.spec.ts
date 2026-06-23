import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { Response } from '@well-known-components/interfaces'

const AUTHOR_PROFILE_FIELDS = ['authorName', 'authorProfilePictureUrl', 'authorHasClaimedName']

test('Get Community Posts Controller v2', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let ownerIdentity: Identity
  let ownerAddress: string
  let communityId: string

  beforeEach(async () => {
    ownerIdentity = await createTestIdentity()
    ownerAddress = ownerIdentity.realAccount.address.toLowerCase()
  })

  describe('when getting posts (v2) from a public community', () => {
    let response: Response

    beforeEach(async () => {
      const community = await components.communitiesDb.createCommunity({
        name: 'Public Community',
        description: 'A public community',
        owner_address: ownerAddress,
        private: false,
        unlisted: false,
        active: true
      })
      communityId = community.id

      await components.communitiesDb.createPost({
        communityId,
        authorAddress: ownerAddress,
        content: 'First post in public community'
      })

      spyComponents.registry.getProfiles.mockResolvedValue([])

      const { localHttpFetch } = components
      response = await localHttpFetch.fetch(`/v2/communities/${communityId}/posts`)
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [ownerAddress])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    it('should return the posts with the author address and a 200 status code', async () => {
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.data.total).toBe(1)
      expect(body.data.posts).toEqual([
        expect.objectContaining({
          communityId,
          authorAddress: ownerAddress,
          content: 'First post in public community',
          createdAt: expect.any(String),
          likesCount: expect.any(Number)
        })
      ])
    })

    it('should not include any author profile information in the posts', async () => {
      const body = await response.json()
      for (const post of body.data.posts) {
        for (const field of AUTHOR_PROFILE_FIELDS) {
          expect(post).not.toHaveProperty(field)
        }
      }
    })

    it('should not call the registry to fetch profiles', async () => {
      expect(spyComponents.registry.getProfiles).not.toHaveBeenCalled()
    })
  })

  describe('when getting posts (v2) from a non-member of a private community', () => {
    let nonMemberIdentity: Identity

    beforeEach(async () => {
      const community = await components.communitiesDb.createCommunity({
        name: 'Private Community',
        description: 'A private community',
        owner_address: ownerAddress,
        private: true,
        unlisted: false,
        active: true
      })
      communityId = community.id
      nonMemberIdentity = await createTestIdentity()
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    it('should respond with a 401 status code', async () => {
      const response = await makeRequest(nonMemberIdentity, `/v2/communities/${communityId}/posts`)
      expect(response.status).toBe(401)
    })
  })
})
