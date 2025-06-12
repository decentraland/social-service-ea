import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/community'
import { randomUUID } from 'crypto'

test('Get Community Places Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when getting places from a community', () => {
    let identity: Identity
    let userAddress: string
    let communityId: string
    let ownerAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      userAddress = identity.realAccount.address.toLowerCase()
      ownerAddress = '0x0000000000000000000000000000000000000001'

      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'Test Description',
          owner_address: ownerAddress
        })
      )
      communityId = result.id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerAddress,
        role: CommunityRole.Owner
      })
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [userAddress, ownerAddress])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/places`)
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeRequest(identity, `/v1/communities/${nonExistentId}/places`)
          expect(response.status).toBe(404)
          expect(await response.json()).toEqual({
            error: 'Not Found',
            message: `Community not found: ${nonExistentId}`
          })
        })
      })

      describe('and the community exists', () => {
        describe('and the user is not a member of the community', () => {
          it('should respond with a 401 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places`)
            expect(response.status).toBe(401)
            expect(await response.json()).toEqual({
              error: 'Not Authorized',
              message: "The user doesn't have permission to get places"
            })
          })
        })

        describe('and the user is a member of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: userAddress,
              role: CommunityRole.Member
            })
          })

          it('should respond with a 200 status code and empty places list when no places exist', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places`)
            expect(response.status).toBe(200)
            const result = await response.json()

            expect(result.data).toEqual({
              results: [],
              total: 0,
              page: 1,
              pages: 0,
              limit: 10
            })
          })

          it('should handle pagination correctly', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places?limit=1&page=1`)
            expect(response.status).toBe(200)
            const result = await response.json()

            expect(result.data).toEqual({
              results: [],
              total: 0,
              page: 1,
              pages: 0,
              limit: 1
            })
          })
        })

        describe('and an error occurs', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: userAddress,
              role: CommunityRole.Member
            })
            spyComponents.community.getPlaces.mockRejectedValue(new Error('Unable to get places'))
          })

          it('should respond with a 500 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places`)
            expect(response.status).toBe(500)
            expect(await response.json()).toEqual({
              message: 'Unable to get places'
            })
          })
        })
      })
    })
  })
})
