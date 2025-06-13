import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/community'
import { randomUUID } from 'crypto'
import { Response } from '@well-known-components/interfaces'

test('Get Community Places Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when getting places from a community', () => {
    let identity: Identity
    let userAddress: string
    let publicCommunityId: string
    let privateCommunityId: string
    let ownerAddress: string
    let publicPlaces: Array<{ id: string }>
    let privatePlaces: Array<{ id: string }>

    beforeEach(async () => {
      identity = await createTestIdentity()
      userAddress = identity.realAccount.address.toLowerCase()
      ownerAddress = '0x0000000000000000000000000000000000000001'

      publicPlaces = [{ id: randomUUID() }, { id: randomUUID() }]
      privatePlaces = [{ id: randomUUID() }, { id: randomUUID() }]

      // Create public community
      const publicResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Public Community',
          description: 'Public Description',
          owner_address: ownerAddress,
          private: false
        })
      )
      publicCommunityId = publicResult.id

      // Create private community
      const privateResult = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Private Community',
          description: 'Private Description',
          owner_address: ownerAddress,
          private: true
        })
      )
      privateCommunityId = privateResult.id

      // Add owner to both communities
      await Promise.all([
        components.communitiesDb.addCommunityMember({
          communityId: publicCommunityId,
          memberAddress: ownerAddress,
          role: CommunityRole.Owner
        }),
        components.communitiesDb.addCommunityMember({
          communityId: privateCommunityId,
          memberAddress: ownerAddress,
          role: CommunityRole.Owner
        })
      ])

      // Add places to public community
      for (const place of publicPlaces) {
        await components.communitiesDb.addCommunityPlace({
          id: place.id,
          communityId: publicCommunityId,
          addedBy: ownerAddress,
          addedAt: new Date()
        })
      }

      // Add places to private community
      for (const place of privatePlaces) {
        await components.communitiesDb.addCommunityPlace({
          id: place.id,
          communityId: privateCommunityId,
          addedBy: ownerAddress,
          addedAt: new Date()
        })
      }
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(publicCommunityId, [userAddress, ownerAddress])
      await components.communitiesDbHelper.forceCommunityMemberRemoval(privateCommunityId, [userAddress, ownerAddress])
      await components.communitiesDbHelper.forceCommunityRemoval(publicCommunityId)
      await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityId)
    })

    describe('and the request is not signed', () => {
      describe('and the community is public', () => {
        it('should respond with a 200 status code and return places', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${publicCommunityId}/places?limit=2&page=1`)

          expect(response.status).toBe(200)
          const result = await response.json()

          expect(result.data).toEqual({
            results: expect.arrayContaining([{ id: publicPlaces[0].id }, { id: publicPlaces[1].id }]),
            total: 2,
            page: 1,
            pages: 1,
            limit: 2
          })
        })
      })

      describe('and the community is private', () => {
        it('should respond with a 404 status code', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${privateCommunityId}/places`)
          expect(response.status).toBe(404)
          expect(await response.json()).toEqual({
            error: 'Not Found',
            message: `Community not found: ${privateCommunityId}`
          })
        })
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
            const response = await makeRequest(identity, `/v1/communities/${privateCommunityId}/places`)
            expect(response.status).toBe(401)
            expect(await response.json()).toEqual({
              error: 'Not Authorized',
              message: `The user ${userAddress} doesn't have permission to get places from community ${privateCommunityId}`
            })
          })
        })

        describe('and the user is a member of the community', () => {
          let response: Response

          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId: privateCommunityId,
              memberAddress: userAddress,
              role: CommunityRole.Member
            })

            response = await makeRequest(identity, `/v1/communities/${privateCommunityId}/places?limit=2&page=1`)
          })

          it('should respond with a 200 status code', async () => {
            expect(response.status).toBe(200)
          })

          it('should return the places', async () => {
            const result = await response.json()

            expect(result.data).toEqual({
              results: expect.arrayContaining([{ id: privatePlaces[0].id }, { id: privatePlaces[1].id }]),
              total: 2,
              page: 1,
              pages: 1,
              limit: 2
            })
          })
        })

        describe('and an error occurs', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId: privateCommunityId,
              memberAddress: userAddress,
              role: CommunityRole.Member
            })
            spyComponents.communityPlaces.getPlaces.mockRejectedValue(new Error('Unable to get places'))
          })

          it('should respond with a 500 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${privateCommunityId}/places`)
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
