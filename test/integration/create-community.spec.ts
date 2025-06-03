import { test } from '../components'
import { createTestIdentity, Identity } from './utils/auth'
import { makeAuthenticatedRequest } from './utils/auth'

test('Create Community Controller', async function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when creating a community', () => {
    let identity: Identity

    beforeEach(async () => {
      identity = await createTestIdentity()
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities`, {
          method: 'POST'
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('but the body is invalid', () => {
        it('should respond with a 400 status code when missing name', async () => {
          const response = await makeRequest(identity, '/v1/communities', 'POST', {
            description: 'Test Description',
            thumbnails: ['https://example.com/thumbnail.png']
          })
          expect(response.status).toBe(400)
        })

        it('should respond with a 400 status code when missing description', async () => {
          const response = await makeRequest(identity, '/v1/communities', 'POST', {
            name: 'Test Community',
            thumbnails: ['https://example.com/thumbnail.png']
          })
          expect(response.status).toBe(400)
        })

        it('should respond with a 400 status code when missing thumbnails', async () => {
          const response = await makeRequest(identity, '/v1/communities', 'POST', {
            name: 'Test Community',
            description: 'Test Description'
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and the body is valid', () => {
        let communityId: string

        afterEach(async () => {
          await components.communitiesDb.deleteCommunity(communityId)
        })

        it('should respond with a 200 status code', async () => {
          const response = await makeRequest(identity, '/v1/communities', 'POST', {
            name: 'Test Community',
            description: 'Test Description',
            thumbnails: ['https://example.com/thumbnail.png']
          })
          const body = await response.json()
          communityId = body.id

          console.log(JSON.stringify(body, null, 2))

          expect(response.status).toBe(201)
          expect(body).toMatchObject({
            data: {
                id: expect.any(String),
                name: 'Test Community',
                description: 'Test Description',
                active: true,
                ownerAddress: identity.realAccount.address.toLowerCase(),
                privacy: 'public'
              },
            message: 'Community created successfully'
          })
        })
      })
    })
  })
})
