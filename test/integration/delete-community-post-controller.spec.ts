import { CommunityPrivacyEnum } from '../../src/logic/community'
import { CommunityRole } from '../../src/types/entities'
import { test } from '../components'
import { createMockProfile } from '../mocks/profile'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

test('Delete Community Post Controller', async function ({ components, stubComponents, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when deleting a community post', () => {
    let ownerIdentity: Identity
    let moderatorIdentity: Identity
    let memberIdentity: Identity
    let communityId: string
    let postId: string

    beforeEach(async () => {
      ownerIdentity = await createTestIdentity()
      moderatorIdentity = await createTestIdentity()
      memberIdentity = await createTestIdentity()

      // Stub Catalyst client responses
      stubComponents.catalystClient.getOwnedNames.resolves([
        { id: '1', name: 'OwnerName', contractAddress: '0x123', tokenId: '1' },
        { id: '2', name: 'ModeratorName', contractAddress: '0x123', tokenId: '2' },
        { id: '3', name: 'MemberName', contractAddress: '0x123', tokenId: '3' }
      ])

      stubComponents.catalystClient.getProfiles.resolves([
        createMockProfile(ownerIdentity.realAccount.address.toLowerCase()),
        createMockProfile(moderatorIdentity.realAccount.address.toLowerCase()),
        createMockProfile(memberIdentity.realAccount.address.toLowerCase())
      ])

      // Create community directly in database
      const community = await components.communitiesDb.createCommunity({
        name: 'Test Community',
        description: 'A test community',
        owner_address: ownerIdentity.realAccount.address.toLowerCase(),
        private: false,
        active: true
      })
      communityId = community.id

      // Add owner, moderator and member directly to database
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Owner
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: moderatorIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Moderator
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: memberIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Member
      })

      // Create a test post directly in database
      const post = await components.communitiesDb.createPost({
        communityId,
        authorAddress: ownerIdentity.realAccount.address.toLowerCase(),
        content: 'Test post to delete'
      })
      postId = post.id
    })

    afterEach(async () => {
      if (communityId) {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [
          ownerIdentity.realAccount.address.toLowerCase(),
          moderatorIdentity.realAccount.address.toLowerCase(),
          memberIdentity.realAccount.address.toLowerCase()
        ])
        await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      }
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/posts/${postId}`, {
          method: 'DELETE'
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and the user is not owner or moderator', () => {
      it('should respond with a 401 status code', async () => {
        const response = await makeRequest(memberIdentity, `/v1/communities/${communityId}/posts/${postId}`, 'DELETE')

        expect(response.status).toBe(401)
      })
    })

    describe('and the user is the owner', () => {
      it('should delete post successfully', async () => {
        const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts/${postId}`, 'DELETE')

        expect(response.status).toBe(204)

        // Verify post is deleted by trying to list posts
        const { localHttpFetch } = components
        const listResponse = await localHttpFetch.fetch(`/v1/communities/${communityId}/posts`)
        const listBody = await listResponse.json()
        expect(listBody.data.posts).toHaveLength(0)
        expect(listBody.data.total).toBe(0)
      })
    })

    describe('and the user is a moderator', () => {
      it('should delete post successfully', async () => {
        const response = await makeRequest(
          moderatorIdentity,
          `/v1/communities/${communityId}/posts/${postId}`,
          'DELETE'
        )

        expect(response.status).toBe(204)

        // Verify post is deleted by trying to list posts
        const { localHttpFetch } = components
        const listResponse = await localHttpFetch.fetch(`/v1/communities/${communityId}/posts`)
        const listBody = await listResponse.json()
        expect(listBody.data.posts).toHaveLength(0)
        expect(listBody.data.total).toBe(0)
      })
    })

    describe('and the post does not exist', () => {
      it('should respond with a 404 status code', async () => {
        const fakePostId = '00000000-0000-0000-0000-000000000000'
        const response = await makeRequest(
          ownerIdentity,
          `/v1/communities/${communityId}/posts/${fakePostId}`,
          'DELETE'
        )

        expect(response.status).toBe(404)
        expect(await response.json()).toMatchObject({
          error: 'Not Found',
          message: `Community post not found: ${fakePostId}`
        })
      })
    })

    describe('and trying to delete already deleted post', () => {
      it('should respond with a 404 status code', async () => {
        // First delete
        await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts/${postId}`, 'DELETE')

        // Try to delete again
        const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts/${postId}`, 'DELETE')

        expect(response.status).toBe(404)
        expect(await response.json()).toMatchObject({
          error: 'Not Found',
          message: `Community post not found: ${postId}`
        })
      })
    })

    describe('and an unhandled error is propagated', () => {
      beforeEach(() => {
        spyComponents.communitiesDb.deletePost.mockRejectedValueOnce(new Error('Unhandled error'))
      })

      it('should respond with a 500 status code', async () => {
        const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts/${postId}`, 'DELETE')
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body).toHaveProperty('message')
        expect(body.message).toBe('Unhandled error')
      })
    })
  })
})
