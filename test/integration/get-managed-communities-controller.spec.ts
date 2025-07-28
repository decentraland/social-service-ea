import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { mockCommunity } from '../mocks/communities'

test('Get Managed Communities Controller', function ({ components, spyComponents }) {
  describe('when getting managed communities', () => {
    let address: string
    let communityId1: string
    let communityId2: string
    let communityId3: string
    let communityId4: string
    let otherAddress: string

    beforeEach(async () => {
      address = '0x1234567890123456789012345678901234567890'
      otherAddress = '0x9876543210987654321098765432109876543210'

      // Create communities with different roles for the user
      const result1 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Owner Community',
          description: 'Test Description 1',
          owner_address: address
        })
      )
      communityId1 = result1.id

      const result2 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Moderator Community',
          description: 'Test Description 2',
          owner_address: otherAddress
        })
      )
      communityId2 = result2.id

      const result3 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Member Community',
          description: 'Test Description 3',
          owner_address: otherAddress
        })
      )
      communityId3 = result3.id

      const result4 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Another Owner Community',
          description: 'Test Description 4',
          owner_address: address
        })
      )
      communityId4 = result4.id

      // Add user to communities with different roles
      await components.communitiesDb.addCommunityMember({
        communityId: communityId1,
        memberAddress: address,
        role: CommunityRole.Owner
      })

      await components.communitiesDb.addCommunityMember({
        communityId: communityId2,
        memberAddress: address,
        role: CommunityRole.Moderator
      })

      await components.communitiesDb.addCommunityMember({
        communityId: communityId3,
        memberAddress: address,
        role: CommunityRole.Member
      })

      await components.communitiesDb.addCommunityMember({
        communityId: communityId4,
        memberAddress: address,
        role: CommunityRole.Owner
      })
    })

    afterEach(async () => {
      // Clean up community memberships
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId1, [address])
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId2, [address])
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId3, [address])
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId4, [address])

      // Clean up communities
      await components.communitiesDbHelper.forceCommunityRemoval(communityId1)
      await components.communitiesDbHelper.forceCommunityRemoval(communityId2)
      await components.communitiesDbHelper.forceCommunityRemoval(communityId3)
      await components.communitiesDbHelper.forceCommunityRemoval(communityId4)
    })

    describe('and the request is not authenticated', () => {
      describe('when no authorization header is provided', () => {
        it('should respond with a 401 status code', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${address}/managed`)
          expect(response.status).toBe(401)
        })
      })

      describe('when invalid authorization header is provided', () => {
        it('should respond with a 401 status code', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${address}/managed`, {
            headers: {
              'Authorization': 'Bearer invalid-token'
            }
          })
          expect(response.status).toBe(401)
        })
      })
    })

    describe('and the request is authenticated with admin token', () => {
      describe('when requesting managed communities for a user with owner and moderator roles', () => {
        it('should respond with a 200 status code and return only communities where user is owner or moderator', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${address}/managed?limit=10&offset=0`, {
            headers: {
              'Authorization': 'Bearer test-token'
            }
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(3)
          expect(body.data.total).toBe(3)
          expect(body.data.page).toBe(1)
          expect(body.data.pages).toBe(1)
          expect(body.data.limit).toBe(10)

          // Verify that only owner and moderator communities are returned
          const communityIds = body.data.results.map((community: any) => community.id)
          expect(communityIds).toContain(communityId1) // Owner community
          expect(communityIds).toContain(communityId4) // Another owner community
          expect(communityIds).toContain(communityId2) // Moderator community
          expect(communityIds).not.toContain(communityId3) // Member community

          // Verify roles are correct
          const ownerCommunities = body.data.results.filter((community: any) => community.role === CommunityRole.Owner)
          const moderatorCommunities = body.data.results.filter((community: any) => community.role === CommunityRole.Moderator)
          expect(ownerCommunities).toHaveLength(2)
          expect(moderatorCommunities).toHaveLength(1)
        })

        it('should not include communities where user is only a member', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${address}/managed`, {
            headers: {
              'Authorization': 'Bearer test-token'
            }
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(3)
          
          // Verify that the member community is not included
          const memberCommunity = body.data.results.find((community: any) => community.id === communityId3)
          expect(memberCommunity).toBeUndefined()
        })
      })

      describe('when requesting managed communities for a user with only member roles', () => {
        let memberOnlyAddress: string

        beforeEach(async () => {
          memberOnlyAddress = '0x1111111111111111111111111111111111111111'

          // Add user to community as member only
          await components.communitiesDb.addCommunityMember({
            communityId: communityId3,
            memberAddress: memberOnlyAddress,
            role: CommunityRole.Member
          })
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId3, [memberOnlyAddress])
        })

        it('should respond with a 200 status code and return empty results', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${memberOnlyAddress}/managed`, {
            headers: {
              'Authorization': 'Bearer test-token'
            }
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              results: [],
              total: 0,
              page: 1,
              pages: 0,
              limit: 100
            }
          })
        })
      })

      describe('when requesting managed communities for a user with no community memberships', () => {
        let nonMemberAddress: string

        beforeEach(async () => {
          nonMemberAddress = '0x2222222222222222222222222222222222222222'
        })

        it('should respond with a 200 status code and return empty results', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${nonMemberAddress}/managed`, {
            headers: {
              'Authorization': 'Bearer test-token'
            }
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              results: [],
              total: 0,
              page: 1,
              pages: 0,
              limit: 100
            }
          })
        })
      })

      describe('when pagination parameters are provided', () => {
        it('should handle pagination correctly with limit and offset', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${address}/managed?limit=2&offset=1`, {
            headers: {
              'Authorization': 'Bearer test-token'
            }
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(2)
          expect(body.data.page).toBe(2)
          expect(body.data.pages).toBe(2)
          expect(body.data.limit).toBe(2)
          expect(body.data.total).toBe(3)
        })

        it('should handle pagination with offset beyond available results', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${address}/managed?limit=10&offset=10`, {
            headers: {
              'Authorization': 'Bearer test-token'
            }
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(0)
          expect(body.data.page).toBe(2)
          expect(body.data.pages).toBe(1)
          expect(body.data.total).toBe(3)
        })
      })

      describe('when requesting managed communities for an invalid address', () => {
        it('should respond with a 200 status code and return empty results', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/invalid-address/managed`, {
            headers: {
              'Authorization': 'Bearer test-token'
            }
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(0)
          expect(body.data.total).toBe(0)
        })
      })
    })

    describe('and the database query fails', () => {
      beforeEach(() => {
        spyComponents.communitiesDb.getMemberCommunities.mockRejectedValue(
          new Error('Database connection failed')
        )
      })

      it('should respond with a 500 status code and error message', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${address}/managed`, {
          headers: {
            'Authorization': 'Bearer test-token'
          }
        })
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body).toHaveProperty('message')
        expect(body.message).toBe('Database connection failed')
      })
    })

    describe('and the count query fails', () => {
      beforeEach(() => {
        spyComponents.communitiesDb.getCommunitiesCount.mockRejectedValue(
          new Error('Count query failed')
        )
      })

      it('should respond with a 500 status code and error message', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${address}/managed`, {
          headers: {
            'Authorization': 'Bearer test-token'
          }
        })
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body).toHaveProperty('message')
        expect(body.message).toBe('Count query failed')
      })
    })
  })
}) 