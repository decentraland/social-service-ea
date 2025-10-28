import { CommunityPrivacyEnum } from '../../src/logic/community'
import { test } from '../components'
import { createMockProfile } from '../mocks/profile'
import { createTestIdentity, Identity, makeAuthenticatedRequest, makeAuthenticatedMultipartRequest } from './utils/auth'

test('Get Community Posts Controller', async function ({ components, stubComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  const makeMultipartRequest = makeAuthenticatedMultipartRequest(components)

  describe('when getting community posts', () => {
    let ownerIdentity: Identity
    let memberIdentity: Identity
    let nonMemberIdentity: Identity
    let publicCommunityId: string
    let privateCommunityId: string

    beforeEach(async () => {
      ownerIdentity = await createTestIdentity()
      memberIdentity = await createTestIdentity()
      nonMemberIdentity = await createTestIdentity()

      // Stub Catalyst client responses
      stubComponents.catalystClient.getOwnedNames.resolves([
        { id: '1', name: 'OwnerName', contractAddress: '0x123', tokenId: '1' },
        { id: '2', name: 'MemberName', contractAddress: '0x123', tokenId: '2' },
        { id: '3', name: 'NonMemberName', contractAddress: '0x123', tokenId: '3' }
      ])

      stubComponents.catalystClient.getProfiles.resolves([
        createMockProfile(ownerIdentity.realAccount.address.toLowerCase()),
        createMockProfile(memberIdentity.realAccount.address.toLowerCase()),
        createMockProfile(nonMemberIdentity.realAccount.address.toLowerCase())
      ])

      // Create public community
      const publicCommunityResponse = await makeMultipartRequest(ownerIdentity, '/v1/communities', {
        name: 'Public Community',
        description: 'A public community',
        privacy: CommunityPrivacyEnum.Public
      })
      const publicBody = await publicCommunityResponse.json()
      publicCommunityId = publicBody.data.id

      // Create private community
      const privateCommunityResponse = await makeMultipartRequest(ownerIdentity, '/v1/communities', {
        name: 'Private Community',
        description: 'A private community',
        privacy: CommunityPrivacyEnum.Private
      })
      const privateBody = await privateCommunityResponse.json()
      privateCommunityId = privateBody.data.id

      // Add member to private community
      await makeRequest(ownerIdentity, `/v1/communities/${privateCommunityId}/members`, 'POST', {
        memberAddress: memberIdentity.realAccount.address
      })

      // Create some test posts
      await makeRequest(ownerIdentity, `/v1/communities/${publicCommunityId}/posts`, 'POST', {
        content: 'First post in public community'
      })

      await makeRequest(ownerIdentity, `/v1/communities/${publicCommunityId}/posts`, 'POST', {
        content: 'Second post in public community'
      })

      await makeRequest(ownerIdentity, `/v1/communities/${privateCommunityId}/posts`, 'POST', {
        content: 'Post in private community'
      })
    })

    afterEach(async () => {
      if (publicCommunityId) {
        await components.communitiesDb.deleteCommunity(publicCommunityId)
      }
      if (privateCommunityId) {
        await components.communitiesDb.deleteCommunity(privateCommunityId)
      }
    })

    describe('and listing posts from public community without auth', () => {
      it('should respond with a 200 status code and return posts', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${publicCommunityId}/posts`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.data.posts).toHaveLength(2)
        expect(body.data.total).toBe(2)
        expect(body.data.posts[0].content).toBe('Second post in public community')
        expect(body.data.posts[1].content).toBe('First post in public community')
        expect(body.data.posts[0].authorName).toBe('OwnerName')
        expect(body.data.posts[0].authorProfilePictureUrl).toBe('https://example.com/avatar.jpg')
        expect(body.data.posts[0].authorHasClaimedName).toBe(true)
      })
    })

    describe('and listing posts from private community without membership', () => {
      it('should respond with a 401 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${privateCommunityId}/posts`)

        expect(response.status).toBe(401)
      })
    })

    describe('and listing posts from private community as member', () => {
      it('should respond with a 200 status code and return posts', async () => {
        const response = await makeRequest(memberIdentity, `/v1/communities/${privateCommunityId}/posts`, 'GET')
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.data.posts).toHaveLength(1)
        expect(body.data.total).toBe(1)
        expect(body.data.posts[0].content).toBe('Post in private community')
      })
    })

    describe('and using pagination', () => {
      it('should respect limit and offset', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${publicCommunityId}/posts?limit=1&offset=1`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.data.posts).toHaveLength(1)
        expect(body.data.total).toBe(2)
        expect(body.data.posts[0].content).toBe('First post in public community')
      })
    })

    describe('and the community does not exist', () => {
      it('should respond with a 404 status code', async () => {
        const fakeCommunityId = '00000000-0000-0000-0000-000000000000'
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${fakeCommunityId}/posts`)
        const body = await response.json()

        expect(response.status).toBe(404)
        expect(body.error).toBe('Not Found')
      })
    })

    describe('and the community has no posts', () => {
      let emptyCommunityId: string

      beforeEach(async () => {
        const emptyCommunityResponse = await makeMultipartRequest(ownerIdentity, '/v1/communities', {
          name: 'Empty Community',
          description: 'A community with no posts',
          privacy: CommunityPrivacyEnum.Public
        })
        const emptyBody = await emptyCommunityResponse.json()
        emptyCommunityId = emptyBody.data.id
      })

      afterEach(async () => {
        if (emptyCommunityId) {
          await components.communitiesDb.deleteCommunity(emptyCommunityId)
        }
      })

      it('should respond with a 200 status code and return empty array', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${emptyCommunityId}/posts`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.data.posts).toHaveLength(0)
        expect(body.data.total).toBe(0)
      })
    })
  })
})
