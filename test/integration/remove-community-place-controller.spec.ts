import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/community'
import { randomUUID } from 'crypto'

test('Remove Community Place Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when removing a place from a community', () => {
    let identity: Identity
    let userAddress: string
    let communityId: string
    let secondCommunityId: string
    let ownerAddress: string
    let placeId: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      userAddress = identity.realAccount.address.toLowerCase()
      ownerAddress = '0x0000000000000000000000000000000000000001'
      placeId = randomUUID()

      // Create first community
      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'Test Description',
          owner_address: ownerAddress
        })
      )
      communityId = result.id

      // Create second community
      const secondResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Second Test Community',
          description: 'Second Test Description',
          owner_address: ownerAddress
        })
      )
      secondCommunityId = secondResult.id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerAddress,
        role: CommunityRole.Owner
      })

      await components.communitiesDb.addCommunityMember({
        communityId: secondCommunityId,
        memberAddress: ownerAddress,
        role: CommunityRole.Owner
      })

      // Add same place to both communities
      await components.communitiesDb.addCommunityPlace({
        id: placeId,
        communityId,
        addedBy: ownerAddress,
        addedAt: new Date()
      })

      await components.communitiesDb.addCommunityPlace({
        id: placeId,
        communityId: secondCommunityId,
        addedBy: ownerAddress,
        addedAt: new Date()
      })
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [userAddress, ownerAddress])
      await components.communitiesDbHelper.forceCommunityMemberRemoval(secondCommunityId, [userAddress, ownerAddress])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      await components.communitiesDbHelper.forceCommunityRemoval(secondCommunityId)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/places/${placeId}`, {
          method: 'DELETE'
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeRequest(identity, `/v1/communities/${nonExistentId}/places/${placeId}`, 'DELETE')
          expect(response.status).toBe(404)
        })
      })

      describe('and the community exists', () => {
        describe('and the user is not a member', () => {
          it('should respond with a 401 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places/${placeId}`, 'DELETE')
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${userAddress} doesn't have permission to remove places from community ${communityId}`
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

          it('should respond with a 401 status code when member tries to remove a place', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places/${placeId}`, 'DELETE')
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${userAddress} doesn't have permission to remove places from community ${communityId}`
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

          it('should respond with a 204 status code when removing a place', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places/${placeId}`, 'DELETE')
            expect(response.status).toBe(204)
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

          it('should respond with a 204 status code when removing a place', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/places/${placeId}`, 'DELETE')
            expect(response.status).toBe(204)
          })
        })

        describe('and the user is the owner of both communities', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: userAddress,
              role: CommunityRole.Owner
            })

            await components.communitiesDb.addCommunityMember({
              communityId: secondCommunityId,
              memberAddress: userAddress,
              role: CommunityRole.Owner
            })
          })

          it('should remove place from first community without affecting second community', async () => {
            const response1 = await makeRequest(identity, `/v1/communities/${communityId}/places/${placeId}`, 'DELETE')
            expect(response1.status).toBe(204)
          })

          it('should remove place from second community without affecting first community', async () => {
            const response1 = await makeRequest(
              identity,
              `/v1/communities/${secondCommunityId}/places/${placeId}`,
              'DELETE'
            )
            expect(response1.status).toBe(204)
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
          spyComponents.communityPlaces.removePlace.mockRejectedValue(new Error('Unable to remove place'))
        })

        it('should respond with a 500 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/places/${placeId}`, 'DELETE')
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
