import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { mockCommunity } from '../mocks/communities'

test('Get Member Communities By IDs Controller', function ({ components, spyComponents }) {
  describe('when getting member communities by IDs', () => {
    let address: string
    let ownerAddress: string
    let headers: Record<string, string>
    let publicCommunityId: string
    let publicCommunityWithMembershipId: string
    let privateCommunityId: string
    let privateCommunityWithMembershipId: string
    let unlistedCommunityId: string
    let unlistedCommunityWithMembershipId: string

    beforeEach(async () => {
      address = '0x1234567890123456789012345678901234567890'
      ownerAddress = '0x9876543210987654321098765432109876543210'

      headers = {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json'
      }

      const publicResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Public Community',
          description: 'A public community the address has not joined',
          owner_address: ownerAddress,
          private: false
        })
      )
      publicCommunityId = publicResult.id

      const publicMemberResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Public Community with Membership',
          description: 'A public community the address is a member of',
          owner_address: ownerAddress,
          private: false
        })
      )
      publicCommunityWithMembershipId = publicMemberResult.id

      const privateResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Private Community',
          description: 'A private community the address has not joined',
          owner_address: ownerAddress,
          private: true
        })
      )
      privateCommunityId = privateResult.id

      const privateMemberResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Private Community with Membership',
          description: 'A private community the address is a member of',
          owner_address: ownerAddress,
          private: true
        })
      )
      privateCommunityWithMembershipId = privateMemberResult.id

      const unlistedResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Unlisted Community',
          description: 'An unlisted community the address has not joined',
          owner_address: ownerAddress,
          unlisted: true
        })
      )
      unlistedCommunityId = unlistedResult.id

      const unlistedMemberResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Unlisted Community with Membership',
          description: 'An unlisted community the address is a member of',
          owner_address: ownerAddress,
          unlisted: true
        })
      )
      unlistedCommunityWithMembershipId = unlistedMemberResult.id

      await components.communitiesDb.addCommunityMember({
        communityId: publicCommunityWithMembershipId,
        memberAddress: address,
        role: CommunityRole.Member
      })
      await components.communitiesDb.addCommunityMember({
        communityId: privateCommunityWithMembershipId,
        memberAddress: address,
        role: CommunityRole.Member
      })
      await components.communitiesDb.addCommunityMember({
        communityId: unlistedCommunityWithMembershipId,
        memberAddress: address,
        role: CommunityRole.Member
      })
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(publicCommunityWithMembershipId, [address])
      await components.communitiesDbHelper.forceCommunityMemberRemoval(privateCommunityWithMembershipId, [address])
      await components.communitiesDbHelper.forceCommunityMemberRemoval(unlistedCommunityWithMembershipId, [address])
      await components.communitiesDbHelper.forceCommunityRemoval(publicCommunityId)
      await components.communitiesDbHelper.forceCommunityRemoval(publicCommunityWithMembershipId)
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
            body: JSON.stringify({ communityIds: [publicCommunityWithMembershipId] })
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
            body: JSON.stringify({ communityIds: [publicCommunityWithMembershipId] })
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
          let tooManyIds: string[]

          beforeEach(() => {
            tooManyIds = Array.from(
              { length: 51 },
              (_, i) => `00000000-0000-0000-0000-${i.toString().padStart(12, '0')}`
            )
          })

          it('should respond with a 400 status code', async () => {
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

      describe('and requesting a public community the address has not joined', () => {
        it('should respond with no communities even though the community is listed', async () => {
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

      describe('and requesting a public community the address is a member of', () => {
        it('should respond with the community and the member role', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [publicCommunityWithMembershipId] })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              communities: [{ id: publicCommunityWithMembershipId, role: CommunityRole.Member }]
            }
          })
        })
      })

      describe('and requesting a private community the address has not joined', () => {
        it('should respond with no communities even though the community is listed', async () => {
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
              communities: []
            }
          })
        })
      })

      describe('and requesting a private community the address is a member of', () => {
        it('should respond with the community and the member role', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [privateCommunityWithMembershipId] })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              communities: [{ id: privateCommunityWithMembershipId, role: CommunityRole.Member }]
            }
          })
        })
      })

      describe('and requesting an unlisted community the address has not joined', () => {
        it('should respond with no communities', async () => {
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

      describe('and requesting an unlisted community the address is a member of', () => {
        it('should respond with the community and the member role', async () => {
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
              communities: [{ id: unlistedCommunityWithMembershipId, role: CommunityRole.Member }]
            }
          })
        })
      })

      describe('and requesting a mix of communities', () => {
        it('should respond only with the communities the address is a member of', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              communityIds: [
                publicCommunityId,
                publicCommunityWithMembershipId,
                privateCommunityId,
                privateCommunityWithMembershipId,
                unlistedCommunityId,
                unlistedCommunityWithMembershipId
              ]
            })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.communities).toHaveLength(3)
          expect(body.data.communities).toEqual(
            expect.arrayContaining([
              { id: publicCommunityWithMembershipId, role: CommunityRole.Member },
              { id: privateCommunityWithMembershipId, role: CommunityRole.Member },
              { id: unlistedCommunityWithMembershipId, role: CommunityRole.Member }
            ])
          )
        })
      })

      describe('and the address holds a moderator role in a community', () => {
        beforeEach(async () => {
          await components.communitiesDb.addCommunityMember({
            communityId: privateCommunityId,
            memberAddress: address,
            role: CommunityRole.Moderator
          })
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityMemberRemoval(privateCommunityId, [address])
        })

        it('should respond with the community and the moderator role', async () => {
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
              communities: [{ id: privateCommunityId, role: CommunityRole.Moderator }]
            }
          })
        })
      })

      describe('and requesting non-existent communities', () => {
        let nonExistentId: string

        beforeEach(() => {
          nonExistentId = '00000000-0000-0000-0000-000000000000'
        })

        it('should respond only with the existing community the address is a member of', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [publicCommunityWithMembershipId, nonExistentId] })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              communities: [{ id: publicCommunityWithMembershipId, role: CommunityRole.Member }]
            }
          })
        })
      })

      describe('and checking a different address', () => {
        let otherAddress: string

        beforeEach(async () => {
          otherAddress = ownerAddress
          await components.communitiesDb.addCommunityMember({
            communityId: publicCommunityId,
            memberAddress: otherAddress,
            role: CommunityRole.Member
          })
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityMemberRemoval(publicCommunityId, [otherAddress])
        })

        it('should respond only with the memberships of that address', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${otherAddress}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [publicCommunityId, publicCommunityWithMembershipId] })
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              communities: [{ id: publicCommunityId, role: CommunityRole.Member }]
            }
          })
        })
      })

      describe('and the address is banned from a community it is a member of', () => {
        beforeEach(async () => {
          await components.communitiesDb.banMemberFromCommunity(publicCommunityWithMembershipId, ownerAddress, address)
        })

        afterEach(async () => {
          await components.communitiesDb.unbanMemberFromCommunity(
            publicCommunityWithMembershipId,
            ownerAddress,
            address
          )
        })

        it('should respond with no communities', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [publicCommunityWithMembershipId] })
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
          spyComponents.communitiesDb.getMemberCommunitiesByIds.mockRejectedValue(
            new Error('Database connection failed')
          )
        })

        it('should respond with a 500 status code', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ communityIds: [publicCommunityWithMembershipId] })
          })
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
