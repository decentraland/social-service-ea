import { randomUUID } from 'node:crypto'
import { CommunityRole } from '../../src/types'
import { CommunityPrivacyEnum } from '../../src/logic/community/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

test('Get All Communities For Moderation Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when getting all communities for moderation', () => {
    let identity: Identity
    let address: string
    let communityId1: string
    let communityId2: string
    let communityId3: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()

      // Create test communities
      const result1 = await components.communitiesDb.createCommunity({
        name: 'Public Community 1',
        description: 'Test Description 1',
        owner_address: '0xde615d3d992ff17ec563ee4387a10d7affcd33c1',
        private: false,
        active: true
      })
      communityId1 = result1.id

      const result2 = await components.communitiesDb.createCommunity({
        name: 'Private Community 2',
        description: 'Test Description 2',
        owner_address: '0x1234567890123456789012345678901234567890',
        private: true,
        active: true
      })
      communityId2 = result2.id

      const result3 = await components.communitiesDb.createCommunity({
        name: 'Another Public Community',
        description: 'Test Description 3',
        owner_address: '0x0987654321098765432109876543210987654321',
        private: false,
        active: true
      })
      communityId3 = result3.id

      // Add members to communities to test member counting
      await components.communitiesDb.addCommunityMember({
        communityId: communityId1,
        memberAddress: '0xmember1',
        role: CommunityRole.Member
      })
      await components.communitiesDb.addCommunityMember({
        communityId: communityId2,
        memberAddress: '0xmember2',
        role: CommunityRole.Member
      })
      await components.communitiesDb.addCommunityMember({
        communityId: communityId3,
        memberAddress: '0xmember3',
        role: CommunityRole.Member
      })
    })

    afterEach(async () => {
      // Clean up test communities
      await components.communitiesDbHelper.forceCommunityRemoval(communityId1)
      await components.communitiesDbHelper.forceCommunityRemoval(communityId2)
      await components.communitiesDbHelper.forceCommunityRemoval(communityId3)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch('/v1/moderation/communities')
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the user is not a global moderator', () => {
        describe('and the feature flags returns other moderators', () => {
          beforeEach(async () => {
            spyComponents.featureFlags.getVariants.mockResolvedValueOnce(['0xother-moderator'])
          })

          it('should respond with a 403 status code', async () => {
            const response = await makeRequest(identity, '/v1/moderation/communities')
            expect(response.status).toBe(403)

            const data = await response.json()
            expect(data.message).toBe('Access denied. Global moderator privileges required.')
          })
        })

        describe('and the feature flags returns undefined', () => {
          beforeEach(async () => {
            spyComponents.featureFlags.getVariants.mockResolvedValueOnce(undefined)
          })

          it('should respond with a 403 status code', async () => {
            const response = await makeRequest(identity, '/v1/moderation/communities')
            expect(response.status).toBe(403)

            const data = await response.json()
            expect(data.message).toBe('Access denied. Global moderator privileges required.')
          })
        })
      })

      describe('and the user is a global moderator', () => {
        beforeEach(async () => {
          spyComponents.featureFlags.getVariants.mockResolvedValueOnce([address.toLowerCase(), '0xother-moderator'])
        })

        describe('when getting all communities', () => {
          it('should respond with a 200 status code and return all communities', async () => {
            const response = await makeRequest(identity, '/v1/moderation/communities')
            expect(response.status).toBe(200)

            const body = await response.json()
            expect(body.data.results).toHaveLength(3)
            expect(body.data.total).toBe(3)
            expect(body.data.page).toBe(1)
            expect(body.data.pages).toBe(1)
            expect(body.data.limit).toBe(100)

            // Verify the communities returned
            expect(body.data.results).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  id: communityId1,
                  name: 'Public Community 1',
                  description: 'Test Description 1',
                  ownerAddress: '0xde615d3d992ff17ec563ee4387a10d7affcd33c1',
                  privacy: CommunityPrivacyEnum.Public,
                  active: true,
                  membersCount: 2
                }),
                expect.objectContaining({
                  id: communityId2,
                  name: 'Private Community 2',
                  description: 'Test Description 2',
                  ownerAddress: '0x1234567890123456789012345678901234567890',
                  privacy: CommunityPrivacyEnum.Private,
                  active: true,
                  membersCount: 2
                }),
                expect.objectContaining({
                  id: communityId3,
                  name: 'Another Public Community',
                  description: 'Test Description 3',
                  ownerAddress: '0x0987654321098765432109876543210987654321',
                  privacy: CommunityPrivacyEnum.Public,
                  active: true,
                  membersCount: 2
                })
              ])
            )
          })
        })

        describe('when filtering by search', () => {
          it('should return communities with search functionality', async () => {
            const response = await makeRequest(identity, '/v1/moderation/communities?search=Public')
            expect(response.status).toBe(200)

            const body = await response.json()
            expect(body.data.results).toHaveLength(2)
            expect(body.data.total).toBe(2)

            // Should only return communities with "Public" in the name
            const communityNames = body.data.results.map((c: any) => c.name)
            expect(communityNames).toContain('Public Community 1')
            expect(communityNames).toContain('Another Public Community')
            expect(communityNames).not.toContain('Private Community 2')
          })
        })

        describe('when filtering by pagination', () => {
          it('should return communities with pagination', async () => {
            const response = await makeRequest(identity, '/v1/moderation/communities?limit=2&offset=0')
            expect(response.status).toBe(200)

            const body = await response.json()
            expect(body.data.results).toHaveLength(2)
            expect(body.data.total).toBe(3)
            expect(body.data.page).toBe(1)
            expect(body.data.pages).toBe(2)
            expect(body.data.limit).toBe(2)
          })

          it('should return second page of communities', async () => {
            const response = await makeRequest(identity, '/v1/moderation/communities?limit=2&offset=2')
            expect(response.status).toBe(200)

            const body = await response.json()
            expect(body.data.results).toHaveLength(1)
            expect(body.data.total).toBe(3)
            expect(body.data.page).toBe(2)
            expect(body.data.pages).toBe(2)
            expect(body.data.limit).toBe(2)
          })
        })

        describe('when searching with no results', () => {
          it('should handle search with no results', async () => {
            const response = await makeRequest(identity, '/v1/moderation/communities?search=nonexistent')
            expect(response.status).toBe(200)

            const body = await response.json()
            expect(body.data.results).toHaveLength(0)
            expect(body.data.total).toBe(0)
          })
        })
      })

      describe('and the feature flags service is unavailable', () => {
        beforeEach(async () => {
          spyComponents.featureFlags.getVariants.mockRejectedValueOnce(new Error('Feature flags service unavailable'))
        })

        it('should respond with a 500 status code', async () => {
          const response = await makeRequest(identity, '/v1/moderation/communities')
          expect(response.status).toBe(500)

          const body = await response.json()
          expect(body.message).toBe('Feature flags service unavailable')
        })
      })
    })
  })
})
