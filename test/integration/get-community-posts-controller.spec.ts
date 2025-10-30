import { CommunityPrivacyEnum } from '../../src/logic/community'
import { CommunityRole } from '../../src/types/entities'
import { test } from '../components'
import { createMockProfileWithDetails, createMockProfile } from '../mocks/profile'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'

test('Get Community Posts Controller', async function ({ components, stubComponents, spyComponents }) {
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
        unlisted: false,
        active: true
      })
      publicCommunityId = publicCommunity.id

      // Create private community directly in database
      const privateCommunity = await components.communitiesDb.createCommunity({
        name: 'Private Community',
        description: 'A private community',
        owner_address: ownerIdentity.realAccount.address.toLowerCase(),
        private: true,
        unlisted: false,
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
        expect(body.data.posts[0]).toMatchObject({
          content: 'Second post in public community',
          authorName: 'OwnerName',
          authorProfilePictureUrl: /^https:\/\/profile-images\.decentraland\.org\/entities\/0x[a-f0-9]+\/face\.png$/,
          authorHasClaimedName: true
        })
        expect(body.data.posts[1]).toMatchObject({
          content: 'First post in public community',
          authorName: 'OwnerName',
          authorProfilePictureUrl: /^https:\/\/profile-images\.decentraland\.org\/entities\/0x[a-f0-9]+\/face\.png$/,
          authorHasClaimedName: true
        })
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
          unlisted: false,
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

    describe('and an unhandled error is propagated', () => {
      beforeEach(() => {
        spyComponents.communitiesDb.getPosts.mockRejectedValueOnce(new Error('Unhandled error'))
      })

      it('should respond with a 500 status code', async () => {
        const response = await components.localHttpFetch.fetch(`/v1/communities/${publicCommunityId}/posts`)
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body).toHaveProperty('message')
        expect(body.message).toBe('Unhandled error')
      })
    })

    describe('and listing posts with likes', () => {
      let likesCommunityId: string
      let likesPostId: string

      beforeEach(async () => {
        // Stub catalyst client responses
        stubComponents.catalystClient.getOwnedNames.resolves([])
        stubComponents.catalystClient.getProfile.resolves(
          createMockProfile(ownerIdentity.realAccount.address.toLowerCase())
        )
        stubComponents.catalystClient.getProfiles.resolves([
          createMockProfile(ownerIdentity.realAccount.address.toLowerCase())
        ])

        // Create community for likes testing
        const community = await components.communitiesDb.createCommunity(
          mockCommunity({
            name: 'Likes Test Community',
            description: 'A test community for likes',
            owner_address: ownerIdentity.realAccount.address.toLowerCase(),
            private: false
          })
        )
        likesCommunityId = community.id

        // Add members to community
        await components.communitiesDb.addCommunityMember({
          communityId: likesCommunityId,
          memberAddress: ownerIdentity.realAccount.address.toLowerCase(),
          role: CommunityRole.Owner
        })

        await components.communitiesDb.addCommunityMember({
          communityId: likesCommunityId,
          memberAddress: memberIdentity.realAccount.address.toLowerCase(),
          role: CommunityRole.Member
        })

        // Create test post
        const post = await components.communitiesDb.createPost({
          communityId: likesCommunityId,
          authorAddress: ownerIdentity.realAccount.address.toLowerCase(),
          content: 'This is a test post'
        })
        likesPostId = post.id

        // Like the post
        await components.communitiesDb.likePost(likesPostId, memberIdentity.realAccount.address.toLowerCase())
      })

      afterEach(async () => {
        if (likesCommunityId) {
          // Clean up likes
          await components.pg.query('DELETE FROM community_post_likes')
          // Clean up posts
          await components.pg.query('DELETE FROM community_posts')
          // Clean up community members
          await components.communitiesDbHelper.forceCommunityMemberRemoval(likesCommunityId, [
            ownerIdentity.realAccount.address.toLowerCase(),
            memberIdentity.realAccount.address.toLowerCase()
          ])
          // Clean up community
          await components.communitiesDbHelper.forceCommunityRemoval(likesCommunityId)
        }
      })

      describe('and the user is authenticated', () => {
        it('should include likes count and isLikedByUser', async () => {
          const response = await makeRequest(memberIdentity, `/v1/communities/${likesCommunityId}/posts`, 'GET')

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.data.posts).toHaveLength(1)
          expect(body.data.posts[0]).toMatchObject({
            id: likesPostId,
            likesCount: 1,
            isLikedByUser: true
          })
        })
      })

      describe('and the user is not authenticated', () => {
        it('should include likes count but not isLikedByUser', async () => {
          const response = await components.localHttpFetch.fetch(`/v1/communities/${likesCommunityId}/posts`)

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.data.posts).toHaveLength(1)
          expect(body.data.posts[0]).toMatchObject({
            id: likesPostId,
            likesCount: 1
          })
          expect(body.data.posts[0].isLikedByUser).toBeUndefined()
        })
      })

      describe('and multiple users like the same post', () => {
        it('should increment the like count correctly', async () => {
          // Add another member
          const anotherMemberIdentity = await createTestIdentity()
          await components.communitiesDb.addCommunityMember({
            communityId: likesCommunityId,
            memberAddress: anotherMemberIdentity.realAccount.address.toLowerCase(),
            role: CommunityRole.Member
          })

          // Like the post with another member
          await components.communitiesDb.likePost(likesPostId, anotherMemberIdentity.realAccount.address.toLowerCase())

          const response = await makeRequest(memberIdentity, `/v1/communities/${likesCommunityId}/posts`, 'GET')

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.data.posts[0].likesCount).toBe(2)
        })
      })

      describe('and the post has zero likes', () => {
        beforeEach(async () => {
          // Unlike the post
          await components.communitiesDb.unlikePost(likesPostId, memberIdentity.realAccount.address.toLowerCase())
        })

        it('should show likesCount: 0 and isLikedByUser: false', async () => {
          const response = await makeRequest(memberIdentity, `/v1/communities/${likesCommunityId}/posts`, 'GET')

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.data.posts[0].likesCount).toBe(0)
          expect(body.data.posts[0].isLikedByUser).toBe(false)
        })
      })
    })
  })
})
