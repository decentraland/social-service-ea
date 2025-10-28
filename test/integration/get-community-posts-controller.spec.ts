import { CommunityPrivacyEnum } from '../../src/logic/community'
import { CommunityRole } from '../../src/types/entities'
import { test } from '../components'
import { createMockProfileWithDetails } from '../mocks/profile'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

test('Get Community Posts Controller', async function ({ components, stubComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

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
        createMockProfileWithDetails(ownerIdentity.realAccount.address.toLowerCase(), { name: 'OwnerName' }),
        createMockProfileWithDetails(memberIdentity.realAccount.address.toLowerCase(), { name: 'MemberName' }),
        createMockProfileWithDetails(nonMemberIdentity.realAccount.address.toLowerCase(), { name: 'NonMemberName' })
      ])

      // Create public community directly in database
      const publicCommunity = await components.communitiesDb.createCommunity({
        name: 'Public Community',
        description: 'A public community',
        owner_address: ownerIdentity.realAccount.address.toLowerCase(),
        private: false,
        active: true
      })
      publicCommunityId = publicCommunity.id

      // Create private community directly in database
      const privateCommunity = await components.communitiesDb.createCommunity({
        name: 'Private Community',
        description: 'A private community',
        owner_address: ownerIdentity.realAccount.address.toLowerCase(),
        private: true,
        active: true
      })
      privateCommunityId = privateCommunity.id

      // Add member to private community
      await components.communitiesDb.addCommunityMember({
        communityId: privateCommunityId,
        memberAddress: memberIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Member
      })

      // Create some test posts directly in database
      await components.communitiesDb.createPost({
        communityId: publicCommunityId,
        authorAddress: ownerIdentity.realAccount.address.toLowerCase(),
        content: 'First post in public community'
      })

      await components.communitiesDb.createPost({
        communityId: publicCommunityId,
        authorAddress: ownerIdentity.realAccount.address.toLowerCase(),
        content: 'Second post in public community'
      })

      await components.communitiesDb.createPost({
        communityId: privateCommunityId,
        authorAddress: ownerIdentity.realAccount.address.toLowerCase(),
        content: 'Post in private community'
      })
    })

    afterEach(async () => {
      if (publicCommunityId) {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(publicCommunityId, [
          ownerIdentity.realAccount.address.toLowerCase(),
          memberIdentity.realAccount.address.toLowerCase(),
          nonMemberIdentity.realAccount.address.toLowerCase()
        ])
        await components.communitiesDbHelper.forceCommunityRemoval(publicCommunityId)
      }
      if (privateCommunityId) {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(privateCommunityId, [
          ownerIdentity.realAccount.address.toLowerCase(),
          memberIdentity.realAccount.address.toLowerCase(),
          nonMemberIdentity.realAccount.address.toLowerCase()
        ])
        await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityId)
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
        expect(body.data.posts[0].authorProfilePictureUrl).toMatch(
          /^https:\/\/profile-images\.decentraland\.org\/entities\/0x[a-f0-9]+\/face\.png$/
        )
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
        const emptyCommunity = await components.communitiesDb.createCommunity({
          name: 'Empty Community',
          description: 'A community with no posts',
          owner_address: ownerIdentity.realAccount.address.toLowerCase(),
          private: false,
          active: true
        })
        emptyCommunityId = emptyCommunity.id
      })

      afterEach(async () => {
        if (emptyCommunityId) {
          await components.communitiesDbHelper.forceCommunityMemberRemoval(emptyCommunityId, [
            ownerIdentity.realAccount.address.toLowerCase()
          ])
          await components.communitiesDbHelper.forceCommunityRemoval(emptyCommunityId)
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
