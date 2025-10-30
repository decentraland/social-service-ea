import { randomUUID } from 'node:crypto'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

test('Delete Community Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when deleting a community', () => {
    let communityId: string
    let address: string
    let identity: Identity

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}`, {
          method: 'DELETE'
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeRequest(identity, `/v1/communities/${nonExistentId}`, 'DELETE')
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
            unlisted: false,
            active: true
          })
          communityId = id
          spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValueOnce(null)
        })

        describe('and the user is not the owner', () => {
          const anotherAddress = '0x1234567890123456789012345678901234567890'
          let anotherCommunityId: string

          beforeEach(async () => {
            const { id } = await components.communitiesDb.createCommunity({
              name: 'Another Community',
              description: 'Another Description',
              owner_address: anotherAddress,
              private: false,
              unlisted: false,
              active: true
            })
            anotherCommunityId = id
          })

          describe('and the user is not a global moderator', () => {
            beforeEach(async () => {
              // Mock feature flags to return empty global moderators list
              spyComponents.featureFlags.getVariants.mockResolvedValueOnce([])
            })

            it('should respond with a 401 status code', async () => {
              const response = await makeRequest(identity, `/v1/communities/${anotherCommunityId}`, 'DELETE')
              expect(response.status).toBe(401)
              expect(spyComponents.featureFlags.getVariants).toHaveBeenCalledWith('communities_global_moderators')
            })
          })

          describe('and the user is a global moderator', () => {
            beforeEach(async () => {
              // Mock feature flags to return global moderators list including the user
              spyComponents.featureFlags.getVariants.mockResolvedValueOnce([
                address.toLowerCase(),
                '0xanother-moderator'
              ])
            })

            it('should respond with a 204 status code and delete the community when user is global moderator', async () => {
              const response = await makeRequest(identity, `/v1/communities/${anotherCommunityId}`, 'DELETE')
              expect(response.status).toBe(204)
              expect(spyComponents.featureFlags.getVariants).toHaveBeenCalledWith('communities_global_moderators')

              // Try to get the deleted community
              const getResponse = await makeRequest(identity, `/v1/communities/${anotherCommunityId}`)
              expect(getResponse.status).toBe(404)
            })
          })

          describe('and global moderators feature flag returns malformed data', () => {
            beforeEach(async () => {
              // Mock feature flags to return malformed global moderators list
              spyComponents.featureFlags.getVariants.mockResolvedValueOnce(['  ', '  ', 'invalid-address', '  '])
            })

            it('should respond with a 401 status code when global moderators feature flag returns malformed data', async () => {
              const response = await makeRequest(identity, `/v1/communities/${anotherCommunityId}`, 'DELETE')
              expect(response.status).toBe(401)
              expect(spyComponents.featureFlags.getVariants).toHaveBeenCalledWith('communities_global_moderators')
            })
          })
        })

        describe('and the user is the owner', () => {
          it('should respond with a 204 status code and delete the community', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}`, 'DELETE')
            expect(response.status).toBe(204)

            // Try to get the deleted community
            const getResponse = await makeRequest(identity, `/v1/communities/${communityId}`)
            expect(getResponse.status).toBe(404)
          })
        })
      })

      describe('and the query fails', () => {
        let failingCommunityId: string

        beforeEach(async () => {
          const { id } = await components.communitiesDb.createCommunity({
            name: 'Failing Community',
            description: 'Failing Description',
            owner_address: address,
            private: false,
            unlisted: false,
            active: true
          })
          failingCommunityId = id
          spyComponents.communitiesDb.deleteCommunity.mockRejectedValueOnce(new Error('Unable to delete community'))
        })

        it('should respond with a 500 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${failingCommunityId}`, 'DELETE')
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
