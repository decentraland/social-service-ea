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
            active: true
          })
          communityId = id
        })

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
      beforeEach(async () => {
        spyComponents.communitiesDb.deleteCommunity.mockRejectedValue(new Error('Unable to delete community'))
      })

      it('should respond with a 500 status code', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}`, 'DELETE')
        expect(response.status).toBe(500)
      })
    })
  })
})
