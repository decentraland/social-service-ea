import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'
import { createMockProfile } from '../mocks/profile'
import { randomUUID } from 'crypto'

test('Unlike Community Post Controller', function ({ components, stubComponents, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when unliking a post', () => {
    let ownerIdentity: Identity
    let memberIdentity: Identity
    let communityId: string
    let postId: string

    beforeEach(async () => {
      // Create test identities
      ownerIdentity = await createTestIdentity()
      memberIdentity = await createTestIdentity()

      // Stub catalyst client responses
      stubComponents.catalystClient.getOwnedNames.resolves([])
      stubComponents.catalystClient.getProfile.resolves(
        createMockProfile(ownerIdentity.realAccount.address.toLowerCase())
      )
      stubComponents.catalystClient.getProfiles.resolves([
        createMockProfile(ownerIdentity.realAccount.address.toLowerCase())
      ])

      // Create community
      const community = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'A test community',
          owner_address: ownerIdentity.realAccount.address.toLowerCase(),
          private: false
        })
      )
      communityId = community.id

      // Add members to community
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Owner
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: memberIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Member
      })

      // Create test post
      const post = await components.communitiesDb.createPost({
        communityId,
        authorAddress: ownerIdentity.realAccount.address.toLowerCase(),
        content: 'This is a test post'
      })
      postId = post.id

      // Like the post first
      await components.communitiesDb.likePost(postId, memberIdentity.realAccount.address.toLowerCase())
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
        const response = await components.localHttpFetch.fetch(`/v1/communities/${communityId}/posts/${postId}/like`, {
          method: 'DELETE'
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and the user has liked the post', () => {
      it('should unlike the post successfully', async () => {
        const response = await makeRequest(
          memberIdentity,
          `/v1/communities/${communityId}/posts/${postId}/like`,
          'DELETE'
        )

        expect(response.status).toBe(204)
      })
    })

    describe('and unliking the same post twice', () => {
      it('should be idempotent', async () => {
        const response1 = await makeRequest(
          memberIdentity,
          `/v1/communities/${communityId}/posts/${postId}/like`,
          'DELETE'
        )
        const response2 = await makeRequest(
          memberIdentity,
          `/v1/communities/${communityId}/posts/${postId}/like`,
          'DELETE'
        )

        expect(response1.status).toBe(204)
        expect(response2.status).toBe(204)
      })
    })

    describe('and the post does not exist', () => {
      it('should return 404', async () => {
        const nonExistentPostId = randomUUID()
        const response = await makeRequest(
          memberIdentity,
          `/v1/communities/${communityId}/posts/${nonExistentPostId}/like`,
          'DELETE'
        )

        expect(response.status).toBe(404)
      })
    })

    describe('and the post is deleted', () => {
      it('should not be able to unlike the deleted post', async () => {
        // Delete the post
        await components.communitiesDb.deletePost(postId)

        const response = await makeRequest(
          memberIdentity,
          `/v1/communities/${communityId}/posts/${postId}/like`,
          'DELETE'
        )

        expect(response.status).toBe(404)
      })
    })

    describe('and an unhandled error is propagated', () => {
      beforeEach(() => {
        spyComponents.communitiesDb.unlikePost.mockRejectedValueOnce(new Error('Unhandled error'))
      })

      it('should respond with a 500 status code', async () => {
        const response = await makeRequest(
          memberIdentity,
          `/v1/communities/${communityId}/posts/${postId}/like`,
          'DELETE'
        )
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body).toHaveProperty('message')
        expect(body.message).toBe('Unhandled error')
      })
    })
  })
})
