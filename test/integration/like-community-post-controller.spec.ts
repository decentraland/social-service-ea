import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'
import { createMockProfile } from '../mocks/profile'
import { randomUUID } from 'crypto'

test('Like Community Post Controller', function ({ components, stubComponents, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when liking a post', () => {
    let ownerIdentity: Identity
    let memberIdentity: Identity
    let nonMemberIdentity: Identity
    let publicCommunityId: string
    let privateCommunityId: string
    let publicPostId: string
    let privatePostId: string

    beforeEach(async () => {
      // Create test identities
      ownerIdentity = await createTestIdentity()
      memberIdentity = await createTestIdentity()
      nonMemberIdentity = await createTestIdentity()

      // Stub catalyst client responses
      stubComponents.catalystClient.getOwnedNames.resolves([])
      stubComponents.registry.getProfile.resolves(
        createMockProfile(ownerIdentity.realAccount.address.toLowerCase())
      )
      stubComponents.registry.getProfiles.resolves([
        createMockProfile(ownerIdentity.realAccount.address.toLowerCase())
      ])

      // Create public community
      const publicCommunity = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Public Test Community',
          description: 'A public test community',
          owner_address: ownerIdentity.realAccount.address.toLowerCase(),
          private: false
        })
      )
      publicCommunityId = publicCommunity.id

      // Create private community
      const privateCommunity = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Private Test Community',
          description: 'A private test community',
          owner_address: ownerIdentity.realAccount.address.toLowerCase(),
          private: true
        })
      )
      privateCommunityId = privateCommunity.id

      // Add members to communities
      await components.communitiesDb.addCommunityMember({
        communityId: publicCommunityId,
        memberAddress: ownerIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Owner
      })

      await components.communitiesDb.addCommunityMember({
        communityId: publicCommunityId,
        memberAddress: memberIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Member
      })

      await components.communitiesDb.addCommunityMember({
        communityId: privateCommunityId,
        memberAddress: ownerIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Owner
      })

      await components.communitiesDb.addCommunityMember({
        communityId: privateCommunityId,
        memberAddress: memberIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Member
      })

      // Create test posts
      const publicPost = await components.communitiesDb.createPost({
        communityId: publicCommunityId,
        authorAddress: ownerIdentity.realAccount.address.toLowerCase(),
        content: 'This is a public post'
      })
      publicPostId = publicPost.id

      const privatePost = await components.communitiesDb.createPost({
        communityId: privateCommunityId,
        authorAddress: ownerIdentity.realAccount.address.toLowerCase(),
        content: 'This is a private post'
      })
      privatePostId = privatePost.id
    })

    afterEach(async () => {
      // Clean up likes
      await components.pg.query('DELETE FROM community_post_likes')
      // Clean up posts
      await components.pg.query('DELETE FROM community_posts')
      // Clean up communities
      await components.pg.query('DELETE FROM communities')
    })

    describe('and the request is not signed', () => {
      it('should return 400', async () => {
        const response = await components.localHttpFetch.fetch(
          `/v1/communities/${publicCommunityId}/posts/${publicPostId}/like`,
          {
            method: 'POST'
          }
        )

        expect(response.status).toBe(400)
      })
    })

    describe('and the user is not a member of a private community', () => {
      it('should return 401', async () => {
        const response = await makeRequest(
          nonMemberIdentity,
          `/v1/communities/${privateCommunityId}/posts/${privatePostId}/like`,
          'POST'
        )

        expect(response.status).toBe(401)
      })
    })

    describe('and the user is banned from the community', () => {
      beforeEach(async () => {
        await components.communitiesDb.banMemberFromCommunity(
          publicCommunityId,
          ownerIdentity.realAccount.address.toLowerCase(),
          memberIdentity.realAccount.address.toLowerCase()
        )
      })

      it('should return 401', async () => {
        const response = await makeRequest(
          memberIdentity,
          `/v1/communities/${publicCommunityId}/posts/${publicPostId}/like`,
          'POST'
        )

        expect(response.status).toBe(401)
      })

      it('should not allow the banned user to like the post', async () => {
        const response = await makeRequest(
          memberIdentity,
          `/v1/communities/${publicCommunityId}/posts/${publicPostId}/like`,
          'POST'
        )

        expect(response.status).toBe(401)
        const result = await components.communitiesDb.isMemberBanned(
          publicCommunityId,
          memberIdentity.realAccount.address.toLowerCase()
        )
        expect(result).toBe(true)
      })
    })

    describe('and the user is a member of a public community', () => {
      it('should like the post successfully', async () => {
        const response = await makeRequest(
          memberIdentity,
          `/v1/communities/${publicCommunityId}/posts/${publicPostId}/like`,
          'POST'
        )

        expect(response.status).toBe(201)
      })
    })

    describe('and the user is a member of a private community', () => {
      it('should like the post successfully', async () => {
        const response = await makeRequest(
          memberIdentity,
          `/v1/communities/${privateCommunityId}/posts/${privatePostId}/like`,
          'POST'
        )

        expect(response.status).toBe(201)
      })
    })

    describe('and liking the same post twice', () => {
      it('should be idempotent', async () => {
        const response1 = await makeRequest(
          memberIdentity,
          `/v1/communities/${publicCommunityId}/posts/${publicPostId}/like`,
          'POST'
        )
        const response2 = await makeRequest(
          memberIdentity,
          `/v1/communities/${publicCommunityId}/posts/${publicPostId}/like`,
          'POST'
        )

        expect(response1.status).toBe(201)
        expect(response2.status).toBe(201)
      })
    })

    describe('and the post does not exist', () => {
      it('should return 404', async () => {
        const nonExistentPostId = randomUUID()
        const response = await makeRequest(
          memberIdentity,
          `/v1/communities/${publicCommunityId}/posts/${nonExistentPostId}/like`,
          'POST'
        )

        expect(response.status).toBe(404)
      })
    })

    describe('and the post is deleted', () => {
      it('should not be able to like the deleted post', async () => {
        // Delete the post
        await components.communitiesDb.deletePost(publicPostId)

        const response = await makeRequest(
          memberIdentity,
          `/v1/communities/${publicCommunityId}/posts/${publicPostId}/like`,
          'POST'
        )

        expect(response.status).toBe(404)
      })
    })

    describe('and an unhandled error is propagated', () => {
      beforeEach(() => {
        spyComponents.communitiesDb.likePost.mockRejectedValueOnce(new Error('Unhandled error'))
      })

      it('should respond with a 500 status code', async () => {
        const response = await makeRequest(
          memberIdentity,
          `/v1/communities/${publicCommunityId}/posts/${publicPostId}/like`,
          'POST'
        )
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body).toHaveProperty('message')
        expect(body.message).toBe('Unhandled error')
      })
    })
  })
})
