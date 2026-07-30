import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'

test('Get Member Communities Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when getting member communities', () => {
    let address: string
    let identity: Identity
    let communityId1: string
    let communityId2: string
    let communityId3: string
    let privateCommunityId: string
    let unlistedCommunityId: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()

      // Create three publicly visible communities with different roles for the user
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
          owner_address: '0x9876543210987654321098765432109876543210'
        })
      )
      communityId2 = result2.id

      const result3 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Member Community',
          description: 'Test Description 3',
          owner_address: '0x9876543210987654321098765432109876543210'
        })
      )
      communityId3 = result3.id

      // Memberships that are not publicly visible: a private community and an unlisted one
      const privateResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Private Community',
          description: 'Test Description 4',
          owner_address: '0x9876543210987654321098765432109876543210',
          private: true
        })
      )
      privateCommunityId = privateResult.id

      const unlistedResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Unlisted Community',
          description: 'Test Description 5',
          owner_address: '0x9876543210987654321098765432109876543210',
          unlisted: true
        })
      )
      unlistedCommunityId = unlistedResult.id

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
        communityId: privateCommunityId,
        memberAddress: address,
        role: CommunityRole.Member
      })

      await components.communitiesDb.addCommunityMember({
        communityId: unlistedCommunityId,
        memberAddress: address,
        role: CommunityRole.Member
      })
    })

    afterEach(async () => {
      const communityIds = [communityId1, communityId2, communityId3, privateCommunityId, unlistedCommunityId]

      for (const communityId of communityIds) {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [address])
        await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      }
    })

    describe('and the request is not signed', () => {
      it('should respond with a 200 status code and only the publicly visible communities', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/members/${address}/communities?limit=10&offset=0`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: {
            results: [
              {
                id: communityId1,
                name: 'Owner Community',
                ownerAddress: address,
                role: CommunityRole.Owner
              },
              {
                id: communityId2,
                name: 'Moderator Community',
                ownerAddress: '0x9876543210987654321098765432109876543210',
                role: CommunityRole.Moderator
              },
              {
                id: communityId3,
                name: 'Member Community',
                ownerAddress: '0x9876543210987654321098765432109876543210',
                role: CommunityRole.Member
              }
            ],
            total: 3,
            page: 1,
            pages: 1,
            limit: 10
          }
        })
      })
    })

    describe('and the request is signed', () => {
      describe("and requesting another user's communities", () => {
        let otherIdentity: Identity

        beforeEach(async () => {
          otherIdentity = await createTestIdentity()
        })

        it('should respond with a 200 status code and only the publicly visible communities', async () => {
          const response = await makeRequest(otherIdentity, `/v1/members/${address}/communities?limit=10&offset=0`)
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results.map((community: { id: string }) => community.id)).toEqual([
            communityId1,
            communityId2,
            communityId3
          ])
          expect(body.data.total).toBe(3)
        })
      })

      describe('and requesting own communities', () => {
        it('should respond with a 200 status code and all the communities the user is a member of ordered by role', async () => {
          const response = await makeRequest(identity, `/v1/members/${address}/communities?limit=10&offset=0`)
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            data: {
              results: [
                {
                  id: communityId1,
                  name: 'Owner Community',
                  ownerAddress: address,
                  role: CommunityRole.Owner
                },
                {
                  id: communityId2,
                  name: 'Moderator Community',
                  ownerAddress: '0x9876543210987654321098765432109876543210',
                  role: CommunityRole.Moderator
                },
                {
                  id: communityId3,
                  name: 'Member Community',
                  ownerAddress: '0x9876543210987654321098765432109876543210',
                  role: CommunityRole.Member
                },
                {
                  id: privateCommunityId,
                  name: 'Private Community',
                  ownerAddress: '0x9876543210987654321098765432109876543210',
                  role: CommunityRole.Member
                },
                {
                  id: unlistedCommunityId,
                  name: 'Unlisted Community',
                  ownerAddress: '0x9876543210987654321098765432109876543210',
                  role: CommunityRole.Member
                }
              ],
              total: 5,
              page: 1,
              pages: 1,
              limit: 10
            }
          })
        })

        it('should handle pagination correctly', async () => {
          const response = await makeRequest(identity, `/v1/members/${address}/communities?limit=2&offset=1`)
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(2)
          expect(body.data.page).toBe(2)
          expect(body.data.pages).toBe(3)
        })
      })

      describe('and the query fails', () => {
        beforeEach(() => {
          spyComponents.communitiesDb.getMemberCommunities.mockRejectedValue(
            new Error('Unable to get member communities')
          )
        })

        it('should respond with a 500 status code', async () => {
          const response = await makeRequest(identity, `/v1/members/${address}/communities`)
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
