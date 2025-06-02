import { randomUUID } from 'node:crypto'
import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/community'
import SQL from 'sql-template-strings'

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

      // Add the user as owner, moderator, and member to different communities
      await components.pg.query(SQL`
        INSERT INTO community_members (community_id, member_address, role)
        VALUES 
          (${communityId1}, ${address}, ${CommunityRole.Owner}),
          (${communityId2}, ${address}, ${CommunityRole.Moderator}),
          (${communityId3}, ${address}, ${CommunityRole.Member})
      `)
    })

    afterEach(async () => {
      await components.pg.query(SQL`
        DELETE FROM community_members WHERE community_id IN (${communityId1}, ${communityId2}, ${communityId3})
      `)
      await components.pg.query(SQL`
        DELETE FROM communities WHERE id IN (${communityId1}, ${communityId2}, ${communityId3})
      `)
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
