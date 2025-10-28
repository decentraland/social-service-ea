import { CommunityPrivacyEnum } from '../../src/logic/community'
import { CommunityRole } from '../../src/types/entities'
import { test } from '../components'
import { createMockProfile } from '../mocks/profile'
import { createTestIdentity, Identity, makeAuthenticatedRequest, makeAuthenticatedMultipartRequest } from './utils/auth'

test('Delete Community Post Controller', async function ({ components, stubComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  const makeMultipartRequest = makeAuthenticatedMultipartRequest(components)

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

      // Create community
      const communityResponse = await makeMultipartRequest(ownerIdentity, '/v1/communities', {
        name: 'Test Community',
        description: 'A test community',
        privacy: CommunityPrivacyEnum.Public
      })
      const communityBody = await communityResponse.json()
      communityId = communityBody.data.id

      // Add moderator and member
      await makeRequest(ownerIdentity, `/v1/communities/${communityId}/members`, 'POST', {
        memberAddress: moderatorIdentity.realAccount.address
      })

      await makeRequest(ownerIdentity, `/v1/communities/${communityId}/members`, 'POST', {
        memberAddress: memberIdentity.realAccount.address
      })

      // Update moderator role
      await makeRequest(
        ownerIdentity,
        `/v1/communities/${communityId}/members/${moderatorIdentity.realAccount.address}`,
        'PATCH',
        {
          role: CommunityRole.Moderator
        }
      )

      // Create a test post
      const postResponse = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts`, 'POST', {
        content: 'Test post to delete'
      })
      const postBody = await postResponse.json()
      postId = postBody.data.id
    })

    afterEach(async () => {
      if (communityId) {
        await components.communitiesDb.deleteCommunity(communityId)
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
        const body = await response.json()
        expect(body.error).toBe('Not Found')
      })
    })

    describe('and trying to delete already deleted post', () => {
      it('should respond with a 404 status code', async () => {
        // First delete
        await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts/${postId}`, 'DELETE')

        // Try to delete again
        const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts/${postId}`, 'DELETE')

        expect(response.status).toBe(404)
        const body = await response.json()
        expect(body.error).toBe('Not Found')
      })
    })
  })
})
