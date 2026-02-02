import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'

test('Get Member Communities By IDs Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when getting member communities by IDs', () => {
    let address: string
    let identity: Identity
    let publicCommunityId: string
    let privateCommunityId: string
    let privateCommunityWithMembershipId: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()

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
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(privateCommunityWithMembershipId, [address])
      await components.communitiesDbHelper.forceCommunityRemoval(publicCommunityId)
      await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityId)
      await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityWithMembershipId)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityIds: [publicCommunityId] })
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe("and requesting communities for another user's address", () => {
        it('should respond with a 401 status code', async () => {
          const otherAddress = '0x9876543210987654321098765432109876543210'
          const response = await makeRequest(
            identity,
            `/v1/members/${otherAddress}/communities`,
            'POST',
            { communityIds: [publicCommunityId] }
          )
          expect(response.status).toBe(401)
        })
      })

      describe('and getting communities for own address', () => {
        describe('and the request body is invalid', () => {
          describe('and communityIds is missing', () => {
            it('should respond with a 400 status code', async () => {
              const response = await makeRequest(identity, `/v1/members/${address}/communities`, 'POST', {})
              expect(response.status).toBe(400)
            })
          })

          describe('and communityIds is empty', () => {
            it('should respond with a 400 status code', async () => {
              const response = await makeRequest(identity, `/v1/members/${address}/communities`, 'POST', {
                communityIds: []
              })
              expect(response.status).toBe(400)
            })
          })

          describe('and communityIds contains invalid UUID', () => {
            it('should respond with a 400 status code', async () => {
              const response = await makeRequest(identity, `/v1/members/${address}/communities`, 'POST', {
                communityIds: ['not-a-uuid']
              })
              expect(response.status).toBe(400)
            })
          })

          describe('and communityIds exceeds maximum limit', () => {
            it('should respond with a 400 status code', async () => {
              const tooManyIds = Array.from({ length: 51 }, (_, i) =>
                `00000000-0000-0000-0000-${i.toString().padStart(12, '0')}`
              )
              const response = await makeRequest(identity, `/v1/members/${address}/communities`, 'POST', {
                communityIds: tooManyIds
              })
              expect(response.status).toBe(400)
            })
          })
        })

        describe('and requesting public communities', () => {
          it('should return the public community', async () => {
            const response = await makeRequest(identity, `/v1/members/${address}/communities`, 'POST', {
              communityIds: [publicCommunityId]
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
          it('should not return the private community', async () => {
            const response = await makeRequest(identity, `/v1/members/${address}/communities`, 'POST', {
              communityIds: [privateCommunityId]
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

        describe('and requesting private communities with membership', () => {
          it('should return the private community', async () => {
            const response = await makeRequest(identity, `/v1/members/${address}/communities`, 'POST', {
              communityIds: [privateCommunityWithMembershipId]
            })
            const body = await response.json()

            expect(response.status).toBe(200)
            expect(body).toEqual({
              data: {
                communities: [{ id: privateCommunityWithMembershipId }]
              }
            })
          })
        })

        describe('and requesting a mix of communities', () => {
          it('should return only visible communities', async () => {
            const response = await makeRequest(identity, `/v1/members/${address}/communities`, 'POST', {
              communityIds: [publicCommunityId, privateCommunityId, privateCommunityWithMembershipId]
            })
            const body = await response.json()

            expect(response.status).toBe(200)
            expect(body.data.communities).toHaveLength(2)
            expect(body.data.communities.map((c: { id: string }) => c.id)).toEqual(
              expect.arrayContaining([publicCommunityId, privateCommunityWithMembershipId])
            )
          })
        })

        describe('and requesting non-existent communities', () => {
          it('should not return non-existent communities', async () => {
            const nonExistentId = '00000000-0000-0000-0000-000000000000'
            const response = await makeRequest(identity, `/v1/members/${address}/communities`, 'POST', {
              communityIds: [publicCommunityId, nonExistentId]
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
          const response = await makeRequest(identity, `/v1/members/${address}/communities`, 'POST', {
            communityIds: [publicCommunityId]
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

        it('should respond with a 500 status code', async () => {
          const response = await makeRequest(identity, `/v1/members/${address}/communities`, 'POST', {
            communityIds: [publicCommunityId]
          })
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
