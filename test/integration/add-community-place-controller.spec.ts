import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/community'
import { randomUUID } from 'crypto'

test('Add Community Place Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when adding places to a community', () => {
    let identity: Identity
    let userAddress: string
    let communityId: string
    let ownerAddress: string
    let mockPlaceIds: string[]

    beforeEach(async () => {
      identity = await createTestIdentity()
      userAddress = identity.realAccount.address.toLowerCase()
      ownerAddress = '0x0000000000000000000000000000000000000001'
      mockPlaceIds = [randomUUID(), randomUUID()]

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
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/places`, {
          method: 'POST',
          body: JSON.stringify({ placeIds: mockPlaceIds })
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeRequest(identity, `/v1/communities/${nonExistentId}/places`, 'POST', {
            placeIds: mockPlaceIds
          })
          expect(response.status).toBe(404)
        })
      })

      describe('and the community exists', () => {
        describe('and the user is not a member', () => {
          it('should respond with a 401 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'POST', {
              placeIds: mockPlaceIds
            })
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${userAddress} doesn't have permission to add places to community ${communityId}`
            })
          })
        })

        describe('and the user is a member', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: userAddress,
              role: CommunityRole.Member
            })
          })

          it('should respond with a 401 status code when member tries to add places', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'POST', {
              placeIds: mockPlaceIds
            })
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${userAddress} doesn't have permission to add places to community ${communityId}`
            })
          })
        })

        describe('and the user is a moderator', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: userAddress,
              role: CommunityRole.Moderator
            })
          })

          it('should respond with a 204 status code when adding places', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'POST', {
              placeIds: mockPlaceIds
            })
            expect(response.status).toBe(204)
          })

          it('should respond with a 400 status code when placeIds is not an array', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'POST', {
              placeIds: 'not-an-array'
            })
            expect(response.status).toBe(400)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Bad request',
              message: 'placeIds must be an array'
            })
          })
        })

        describe('and the user is the owner', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: userAddress,
              role: CommunityRole.Owner
            })
          })

          it('should respond with a 204 status code when adding places', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'POST', {
              placeIds: mockPlaceIds
            })
            expect(response.status).toBe(204)
          })
        })
      })

      describe('and an error occurs', () => {
        beforeEach(async () => {
          await components.communitiesDb.addCommunityMember({
            communityId,
            memberAddress: userAddress,
            role: CommunityRole.Owner
          })
          spyComponents.communityPlaces.addPlaces.mockRejectedValue(new Error('Unable to add places'))
        })

        it('should respond with a 500 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'POST', {
            placeIds: mockPlaceIds
          })
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
