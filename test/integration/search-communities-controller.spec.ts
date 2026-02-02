import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'

test('Search Communities Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when searching communities', () => {
    let address: string
    let identity: Identity
    let communityId1: string
    let communityId2: string
    let unlistedCommunityId: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()

      const result1 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Alpha Community',
          description: 'Test Description 1',
          owner_address: address
        })
      )
      communityId1 = result1.id

      const result2 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Beta Community',
          description: 'Test Description 2',
          owner_address: address
        })
      )
      communityId2 = result2.id

      const result3 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Alpha Unlisted',
          description: 'Unlisted community',
          owner_address: address,
          unlisted: true
        })
      )
      unlistedCommunityId = result3.id
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityRemoval(communityId1)
      await components.communitiesDbHelper.forceCommunityRemoval(communityId2)
      await components.communitiesDbHelper.forceCommunityRemoval(unlistedCommunityId)
    })

    describe('and the search query is missing', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch('/v1/communities/search')

        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body.message).toContain('at least 2 characters')
      })
    })

    describe('and the search query is too short', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch('/v1/communities/search?q=a')

        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body.message).toContain('at least 2 characters')
      })
    })

    describe('and the search query is valid', () => {
      describe('and the request is not signed', () => {
        it('should respond with matching listed communities', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch('/v1/communities/search?q=Alpha')

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.data.communities).toHaveLength(1)
          expect(body.data.communities[0]).toEqual({
            id: communityId1,
            name: 'Alpha Community'
          })
        })

        it('should not include unlisted communities', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch('/v1/communities/search?q=Alpha')

          expect(response.status).toBe(200)
          const body = await response.json()
          const ids = body.data.communities.map((c: { id: string }) => c.id)
          expect(ids).not.toContain(unlistedCommunityId)
        })
      })

      describe('and the request is signed', () => {
        describe('and the user is not a member of the unlisted community', () => {
          it('should not include unlisted communities', async () => {
            const response = await makeRequest(identity, '/v1/communities/search?q=Alpha')

            expect(response.status).toBe(200)
            const body = await response.json()
            const ids = body.data.communities.map((c: { id: string }) => c.id)
            expect(ids).toContain(communityId1)
            expect(ids).not.toContain(unlistedCommunityId)
          })
        })

        describe('and the user is a member of the unlisted community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId: unlistedCommunityId,
              memberAddress: address,
              role: CommunityRole.Member
            })
          })

          afterEach(async () => {
            await components.communitiesDbHelper.forceCommunityMemberRemoval(unlistedCommunityId, [address])
          })

          it('should include unlisted communities the user is a member of', async () => {
            const response = await makeRequest(identity, '/v1/communities/search?q=Alpha')

            expect(response.status).toBe(200)
            const body = await response.json()
            const ids = body.data.communities.map((c: { id: string }) => c.id)
            expect(ids).toContain(communityId1)
            expect(ids).toContain(unlistedCommunityId)
          })
        })
      })

      describe('and using prefix matching', () => {
        it('should match communities starting with the search term', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch('/v1/communities/search?q=Beta')

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.data.communities).toHaveLength(1)
          expect(body.data.communities[0].name).toBe('Beta Community')
        })

        it('should match words in the middle of the name', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch('/v1/communities/search?q=Community')

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.data.communities.length).toBeGreaterThanOrEqual(2)
        })
      })

      describe('and using limit parameter', () => {
        it('should respect the limit parameter', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch('/v1/communities/search?q=Community&limit=1')

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.data.communities).toHaveLength(1)
        })

        it('should use default limit when not provided', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch('/v1/communities/search?q=Community')

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.data.communities.length).toBeLessThanOrEqual(10)
        })

        it('should cap limit at maximum value', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch('/v1/communities/search?q=Community&limit=100')

          expect(response.status).toBe(200)
          const body = await response.json()
          // Results should be limited to MAX_LIMIT (50)
          expect(body.data.communities.length).toBeLessThanOrEqual(50)
        })
      })

      describe('and no communities match', () => {
        it('should return an empty array', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch('/v1/communities/search?q=NonExistent')

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.data.communities).toEqual([])
        })
      })
    })

    describe('and the query fails', () => {
      beforeEach(() => {
        spyComponents.communitiesDb.searchCommunities.mockRejectedValue(new Error('Database error'))
      })

      it('should respond with a 500 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch('/v1/communities/search?q=Alpha')

        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body.message).toBe('Database error')
      })
    })
  })
})
