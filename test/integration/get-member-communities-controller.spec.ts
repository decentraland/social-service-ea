import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/community'

test('Get Member Communities Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when getting member communities', () => {
    let address: string
    let identity: Identity
    let communityId1: string
    let communityId2: string
    let communityId3: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()

      // Create three communities with different roles for the user
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
    })

    afterEach(async () => {
      components.communitiesDbHelper.forceCommunityMemberRemoval(communityId1, [address])
      components.communitiesDbHelper.forceCommunityMemberRemoval(communityId2, [address])
      components.communitiesDbHelper.forceCommunityMemberRemoval(communityId3, [address])

      components.communitiesDbHelper.forceCommunityRemoval(communityId1)
      components.communitiesDbHelper.forceCommunityRemoval(communityId2)
      components.communitiesDbHelper.forceCommunityRemoval(communityId3)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/members/${address}/communities`)
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe("and requesting another user's communities", () => {
        it('should respond with a 401 status code', async () => {
          const otherAddress = '0x9876543210987654321098765432109876543210'
          const response = await makeRequest(identity, `/v1/members/${otherAddress}/communities`)
          expect(response.status).toBe(401)
        })
      })

      describe('and requesting own communities', () => {
        it('should respond with a 200 status code and the communities the user is a member of ordered by role', async () => {
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
                }
              ],
              total: 3,
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
          expect(body.data.pages).toBe(2)
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
