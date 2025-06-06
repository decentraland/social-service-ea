import { test } from '../components'
import { createTestIdentity, Identity } from './utils/auth'
import { makeAuthenticatedRequest } from './utils/auth'

test('Create Community Controller', async function ({ components, stubComponents }) {
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

        // TODO: add thumbnails validation when implemented
        it.skip('should respond with a 400 status code when missing thumbnails', async () => {
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

        describe('when the user owns a name', () => {
          beforeEach(async () => {
            stubComponents.catalystClient.getOwnedNames.onFirstCall().resolves([{
              id: '1',
              name: 'testOwnedName',
              contractAddress: '0x0000000000000000000000000000000000000000',
              tokenId: '1'
            }])
          })

          it('should respond with a 200 status code', async () => {
            const response = await makeRequest(identity, '/v1/communities', 'POST', {
              name: 'Test Community',
              description: 'Test Description',
              thumbnails: ['https://example.com/thumbnail.png']
            })
            const body = await response.json()
            communityId = body.id
  
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

          describe('but names cannot be fetched', () => {
            beforeEach(async () => {
              stubComponents.catalystClient.getOwnedNames.onFirstCall().rejects(new Error('Failed to fetch names'))
            })
            
            it('should respond with a 500 status code', async () => {
              const response = await makeRequest(identity, '/v1/communities', 'POST', {
                name: 'Test Community',
                description: 'Test Description',
                thumbnails: ['https://example.com/thumbnail.png']
              })

              expect(response.status).toBe(500)
              expect(await response.json()).toMatchObject({
                message: 'Failed to fetch names'
              })
            })
          })
        })

        describe('when the user does not own a name', () => {
          beforeEach(async () => {
            stubComponents.catalystClient.getOwnedNames.onFirstCall().resolves([])
          })
          
          it('should respond with a 401 status code', async () => {
            const response = await makeRequest(identity, '/v1/communities', 'POST', {
              name: 'Test Community',
              description: 'Test Description',
              thumbnails: ['https://example.com/thumbnail.png']
            })

            expect(response.status).toBe(401)
            expect(await response.json()).toMatchObject({
              message: `The user ${identity.realAccount.address.toLowerCase()} doesn't have any names`
            })
          })
        })
      })
    })
  })
})
