import { randomUUID } from 'node:crypto'
import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { createMockProfile } from '../mocks/profile'

test('Get Community Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when getting a community', () => {
    let communityId: string
    let address: string
    let identity: Identity
    let ownerProfile: ReturnType<typeof createMockProfile>

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()
      ownerProfile = createMockProfile(address)
      spyComponents.catalystClient.getProfile.mockResolvedValue(ownerProfile)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}`)
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeRequest(identity, `/v1/communities/${nonExistentId}`)
          expect(response.status).toBe(404)
        })
      })

      describe('and the community exists', () => {
        beforeEach(async () => {
          const { id } = await components.communitiesDb.createCommunity({
            name: 'Test Community',
            description: 'Test Description',
            owner_address: address,
            private: false,
            active: true
          })
          communityId = id
        })

        describe('and the community is active', () => {
          it('should respond with a 200 status code and the community with owner profile', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}`)
            const body = await response.json()

            expect(response.status).toBe(200)
            expect(body).toEqual({
              data: {
                id: communityId,
                name: 'Test Community',
                description: 'Test Description',
                privacy: 'public',
                active: true,
                role: CommunityRole.None,
                membersCount: 0,
                owner: {
                  address: address,
                  name: ownerProfile.avatars[0].name
                }
              }
            })
          })

          it('should fetch owner profile from catalyst client', async () => {
            await makeRequest(identity, `/v1/communities/${communityId}`)

            expect(spyComponents.catalystClient.getProfile).toHaveBeenCalledWith(address)
          })

          it('should handle missing owner profile gracefully', async () => {
            spyComponents.catalystClient.getProfile.mockResolvedValue(null)

            const response = await makeRequest(identity, `/v1/communities/${communityId}`)
            const body = await response.json()

            expect(response.status).toBe(200)
            expect(body.data.owner).toEqual({
              address,
              name: ''
            })
          })

          describe('and the community has a thumbnail', () => {
            let expectedCdn: string
            beforeEach(async () => {
              expectedCdn = await components.config.requireString('CDN_URL')
              await components.storage.storeFile(Buffer.from('test'), `communities/${communityId}/raw-thumbnail.png`)
            })

            afterEach(async () => {
              await components.storageHelper.removeFile(`communities/${communityId}/raw-thumbnail.png`)
            })

            it('should return the thumbnail raw url in the response', async () => {
              const response = await makeRequest(identity, `/v1/communities/${communityId}`)
              const body = await response.json()
              expect(body.data.thumbnails.raw).toBe(
                `${expectedCdn}/social/communities/${communityId}/raw-thumbnail.png`
              )
            })
          })
        })

        describe('and the community is inactive', () => {
          beforeEach(async () => {
            await components.communitiesDb.deleteCommunity(communityId)
          })

          it('should respond with a 404 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}`)
            expect(response.status).toBe(404)
          })
        })
      })

      describe('and the query fails', () => {
        beforeEach(async () => {
          spyComponents.communitiesDb.getCommunity.mockRejectedValue(new Error('Unable to get community'))
        })

        it('should respond with a 500 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}`)
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
