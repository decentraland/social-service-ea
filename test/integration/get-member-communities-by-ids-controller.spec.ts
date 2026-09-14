import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { mockCommunity } from '../mocks/communities'

test('Get Member Communities By IDs Controller', function ({ components, spyComponents }) {
  describe('when getting member communities by IDs', () => {
    let address: string
    let publicCommunityId: string
    let privateCommunityId: string
    let privateCommunityWithMembershipId: string
    let unlistedCommunityId: string
    let unlistedCommunityWithMembershipId: string
    let headers: Record<string, string>

    beforeEach(async () => {
      address = '0x1234567890123456789012345678901234567890'

      headers = {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json'
      }

      // Create a public community (visible to all)
      const publicResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Public Community',
          description: 'A public community',
          owner_address: '0x9876543210987654321098765432109876543210',
          private: false
        })
      )
      publicCommunityId = publicResult.id

      // Create a private community (not visible unless member)
      const privateResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Private Community',
          description: 'A private community',
          owner_address: '0x9876543210987654321098765432109876543210',
          private: true
        })
      )
      privateCommunityId = privateResult.id

      // Create a private community where user is a member
      const privateMemberResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Private Community with Membership',
          description: 'A private community where user is a member',
          owner_address: '0x9876543210987654321098765432109876543210',
          private: true
        })
      )
      privateCommunityWithMembershipId = privateMemberResult.id

      // Add user as member of the private community
      await components.communitiesDb.addCommunityMember({
        communityId: privateCommunityWithMembershipId,
        memberAddress: address,
        role: CommunityRole.Member
      })

      // Create an unlisted community (not visible unless member)
      const unlistedResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Unlisted Community',
          description: 'An unlisted community',
          owner_address: '0x9876543210987654321098765432109876543210',
          unlisted: true
        })
      )
      unlistedCommunityId = unlistedResult.id

      // Create an unlisted community where user is a member
      const unlistedMemberResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Unlisted Community with Membership',
          description: 'An unlisted community where user is a member',
          owner_address: '0x9876543210987654321098765432109876543210',
          unlisted: true
        })
      )
      unlistedCommunityWithMembershipId = unlistedMemberResult.id

      // Add user as member of the unlisted community
      await components.communitiesDb.addCommunityMember({
        communityId: unlistedCommunityWithMembershipId,
        memberAddress: address,
        role: CommunityRole.Member
      })
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(privateCommunityWithMembershipId, [address])
      await components.communitiesDbHelper.forceCommunityMemberRemoval(unlistedCommunityWithMembershipId, [address])
      await components.communitiesDbHelper.forceCommunityRemoval(publicCommunityId)
      await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityId)
      await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityWithMembershipId)
      await components.communitiesDbHelper.forceCommunityRemoval(unlistedCommunityId)
      await components.communitiesDbHelper.forceCommunityRemoval(unlistedCommunityWithMembershipId)
    })

    describe('and the request is not authenticated', () => {
      describe('and no authorization header is provided', () => {
        it('should respond with a 401 status code', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ communityIds: [publicCommunityId] })
          })
          expect(response.status).toBe(401)
        })
      })

      describe('and invalid authorization header is provided', () => {
        it('should respond with a 401 status code', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers: {
              Authorization: 'Bearer invalid-token',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ communityIds: [publicCommunityId] })
          })
          expect(response.status).toBe(401)
        })
      })
    })

    describe('and the request is authenticated with admin token', () => {
      describe('and the request body is invalid', () => {
        describe('and communityIds is missing', () => {
          it('should respond with a 400 status code', async () => {
            const { localHttpFetch } = components
            const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
              method: 'POST',
              headers,
              body: JSON.stringify({})
            })
            expect(response.status).toBe(400)
          })
        })

        describe('and communityIds is empty', () => {
          it('should respond with a 400 status code', async () => {
            const { localHttpFetch } = components
            const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ communityIds: [] })
            })
            expect(response.status).toBe(400)
          })
        })

        describe('and communityIds contains invalid UUID', () => {
          it('should respond with a 400 status code', async () => {
            const { localHttpFetch } = components
            const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ communityIds: ['not-a-uuid'] })
            })
            expect(response.status).toBe(400)
          })
        })

        describe('and communityIds exceeds maximum limit', () => {
          it('should respond with a 400 status code', async () => {
            const tooManyIds = Array.from({ length: 51 }, (_, i) =>
              `00000000-0000-0000-0000-${i.toString().padStart(12, '0')}`
            )
            const { localHttpFetch } = components
            const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ communityIds: tooManyIds })
            })
            expect(response.status).toBe(400)
          })
        })
      })

      describe('and requesting public communities', () => {
        it('should return the public community', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [publicCommunityId] })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              communities: [{ id: publicCommunityId }]
            }
          })
        })
      })

      describe('and requesting private communities without membership', () => {
        it('should return the private community', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [privateCommunityId] })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              communities: [{ id: privateCommunityId }]
            }
          })
        })
      })

      describe('and requesting a mix of communities', () => {
        it('should return only addable communities', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              communityIds: [
                publicCommunityId,
                privateCommunityId,
                privateCommunityWithMembershipId,
                unlistedCommunityId,
                unlistedCommunityWithMembershipId
              ]
            })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.communities).toHaveLength(4)
          expect(body.data.communities.map((c: { id: string }) => c.id)).toEqual(
            expect.arrayContaining([
              publicCommunityId,
              privateCommunityId,
              privateCommunityWithMembershipId,
              unlistedCommunityWithMembershipId
            ])
          )
        })
      })

      describe('and requesting unlisted communities without membership', () => {
        it('should not return the unlisted community', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [unlistedCommunityId] })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              communities: []
            }
          })
        })
      })

      describe('and requesting unlisted communities with membership', () => {
        it('should return the unlisted community', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [unlistedCommunityWithMembershipId] })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              communities: [{ id: unlistedCommunityWithMembershipId }]
            }
          })
        })
      })

      describe('and requesting non-existent communities', () => {
        it('should not return non-existent communities', async () => {
          const nonExistentId = '00000000-0000-0000-0000-000000000000'
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [publicCommunityId, nonExistentId] })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              communities: [{ id: publicCommunityId }]
            }
          })
        })
      })

      describe('and checking any user address', () => {
        it('should allow checking any address without restriction', async () => {
          const otherAddress = '0x9876543210987654321098765432109876543210'
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${otherAddress}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [publicCommunityId] })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              communities: [{ id: publicCommunityId }]
            }
          })
        })
      })

      describe('and the user is banned from a community', () => {
        beforeEach(async () => {
          await components.communitiesDb.banMemberFromCommunity(
            publicCommunityId,
            '0x9876543210987654321098765432109876543210',
            address
          )
        })

        afterEach(async () => {
          await components.communitiesDb.unbanMemberFromCommunity(
            publicCommunityId,
            '0x9876543210987654321098765432109876543210',
            address
          )
        })

        it('should not return the community user is banned from', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [publicCommunityId] })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              communities: []
            }
          })
        })
      })

      describe('and the database query fails', () => {
        beforeEach(() => {
          spyComponents.communitiesDb.getVisibleCommunitiesByIds.mockRejectedValue(
            new Error('Database connection failed')
          )
        })

        it('should respond with a 500 status code and error message', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [publicCommunityId] })
          })
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
