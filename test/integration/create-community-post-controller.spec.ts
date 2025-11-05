import { CommunityPrivacyEnum } from '../../src/logic/community'
import { test } from '../components'
import { createMockProfile } from '../mocks/profile'
import { createTestIdentity, Identity, makeAuthenticatedRequest, makeAuthenticatedMultipartRequest } from './utils/auth'
import { CommunityRole } from '../../src/types/entities'

test('Create Community Post Controller', async function ({ components, stubComponents, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  const makeMultipartRequest = makeAuthenticatedMultipartRequest(components)

  describe('when creating a community post', () => {
    let ownerIdentity: Identity
    let moderatorIdentity: Identity
    let memberIdentity: Identity
    let nonMemberIdentity: Identity
    let communityId: string

    beforeEach(async () => {
      ownerIdentity = await createTestIdentity()
      moderatorIdentity = await createTestIdentity()
      memberIdentity = await createTestIdentity()
      nonMemberIdentity = await createTestIdentity()

      // Mock AI compliance validator
      stubComponents.communityComplianceValidator.validateCommunityContent.resolves()

      // Mock catalyst client for community creation
      stubComponents.catalystClient.getOwnedNames.resolves([
        { id: '1', name: 'OwnerName', contractAddress: '0x123', tokenId: '1' }
      ])
      stubComponents.catalystClient.getProfile.resolves(
        createMockProfile(ownerIdentity.realAccount.address.toLowerCase())
      )

      // Create a test community
      const createCommunityResponse = await makeMultipartRequest(ownerIdentity, '/v1/communities', {
        name: 'Test Community',
        description: 'A test community for posts',
        privacy: CommunityPrivacyEnum.Public
      })
      const createBody = await createCommunityResponse.json()
      communityId = createBody.data.id
    })

    afterEach(async () => {
      if (communityId) {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [
          ownerIdentity.realAccount.address.toLowerCase(),
          moderatorIdentity.realAccount.address.toLowerCase(),
          memberIdentity.realAccount.address.toLowerCase(),
          nonMemberIdentity.realAccount.address.toLowerCase()
        ])
        await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      }
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/posts`, {
          method: 'POST',
          body: JSON.stringify({ content: 'Test post content' }),
          headers: { 'Content-Type': 'application/json' }
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and the user is not a member', () => {
      it('should respond with a 401 status code', async () => {
        const response = await makeRequest(nonMemberIdentity, `/v1/communities/${communityId}/posts`, 'POST', {
          content: 'Test post content'
        })

        expect(response.status).toBe(401)
      })
    })

    describe('and the user is a member but not owner or moderator', () => {
      beforeEach(async () => {
        // Add member
        await makeRequest(ownerIdentity, `/v1/communities/${communityId}/members`, 'POST', {
          memberAddress: memberIdentity.realAccount.address
        })
      })

      it('should respond with a 401 status code', async () => {
        const response = await makeRequest(memberIdentity, `/v1/communities/${communityId}/posts`, 'POST', {
          content: 'Test post content'
        })

        expect(response.status).toBe(401)
      })
    })

    describe('and the user is the owner', () => {
      it('should create post successfully with author profile', async () => {
        const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts`, 'POST', {
          content: 'Test post content from owner'
        })

        expect(response.status).toBe(201)
        const body = await response.json()
        expect(body.data).toMatchObject({
          communityId,
          authorAddress: ownerIdentity.realAccount.address.toLowerCase(),
          content: 'Test post content from owner',
          authorName: expect.any(String),
          authorProfilePictureUrl: expect.any(String),
          authorHasClaimedName: expect.any(Boolean)
        })
        expect(body.data.id).toBeDefined()
        expect(body.data.createdAt).toBeDefined()
      })
    })

    describe('and the user is a moderator', () => {
      beforeEach(async () => {
        // Add moderator directly to database with Moderator role
        await components.communitiesDb.addCommunityMember({
          communityId,
          memberAddress: moderatorIdentity.realAccount.address.toLowerCase(),
          role: CommunityRole.Moderator
        })
      })

      it('should create post successfully with author profile', async () => {
        const response = await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/posts`, 'POST', {
          content: 'Test post content from moderator'
        })

        expect(response.status).toBe(201)
        const body = await response.json()
        expect(body.data).toMatchObject({
          communityId,
          authorAddress: moderatorIdentity.realAccount.address.toLowerCase(),
          content: 'Test post content from moderator',
          authorName: expect.any(String),
          authorProfilePictureUrl: expect.any(String),
          authorHasClaimedName: expect.any(Boolean)
        })
      })
    })

    describe('and the content is empty', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts`, 'POST', {
          content: ''
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and the content is only whitespace', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts`, 'POST', {
          content: '   \n\t   '
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and the content starts with whitespace', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts`, 'POST', {
          content: '   hello world'
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and the content exceeds 1000 characters', () => {
      it('should respond with a 400 status code', async () => {
        const longContent = 'a'.repeat(1001)
        const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts`, 'POST', {
          content: longContent
        })

        expect(response.status).toBe(400)
      })
    })

    describe('and the content is exactly 1000 characters', () => {
      it('should create post successfully', async () => {
        const exactContent = 'a'.repeat(1000)
        const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts`, 'POST', {
          content: exactContent
        })

        expect(response.status).toBe(201)
        const body = await response.json()
        expect(body.data.content).toBe(exactContent)
      })
    })

    describe('and the community does not exist', () => {
      it('should respond with a 404 status code', async () => {
        const fakeCommunityId = '00000000-0000-0000-0000-000000000000'
        const response = await makeRequest(ownerIdentity, `/v1/communities/${fakeCommunityId}/posts`, 'POST', {
          content: 'Test post content'
        })

        expect(response.status).toBe(404)
        expect(await response.json()).toMatchObject({
          error: 'Not Found',
          message: `Community not found: ${fakeCommunityId}`
        })
      })
    })

    describe('and an unhandled error is propagated', () => {
      beforeEach(() => {
        spyComponents.communitiesDb.createPost.mockRejectedValueOnce(new Error('Unhandled error'))
      })

      it('should respond with a 500 status code', async () => {
        const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/posts`, 'POST', {
          content: 'Test post content'
        })
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body).toHaveProperty('message')
        expect(body.message).toBe('Unhandled error')
      })
    })
  })
})
