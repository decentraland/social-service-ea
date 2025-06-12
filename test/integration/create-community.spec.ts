import { test } from '../components'
import { createTestIdentity, Identity } from './utils/auth'
import { makeAuthenticatedMultipartRequest } from './utils/auth'

test('Create Community Controller', async function ({ components, stubComponents }) {
  const makeMultipartRequest = makeAuthenticatedMultipartRequest(components)

  describe('when creating a community', () => {
    let identity: Identity

    beforeEach(async () => {
      identity = await createTestIdentity()
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities`, { method: 'POST' })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('but the body is invalid', () => {
        it('should respond with a 400 status code when missing name', async () => {
          const response = await makeMultipartRequest(identity, '/v1/communities', {
            description: 'Test Description',
            thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
          })

          expect(response.status).toBe(400)
        })

        it('should respond with a 400 status code when missing description', async () => {
          const response = await makeMultipartRequest(identity, '/v1/communities', {
            name: 'Test Community',
            thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and the body is valid', () => {
        let communityId: string
        let validBody: { name: string; description: string; thumbnailPath?: string } = {
          name: 'Test Community',
          description: 'Test Description'
        }

        afterEach(async () => {
          await components.communitiesDb.deleteCommunity(communityId)
        })

        describe('when the user owns a name', () => {
          beforeEach(async () => {
            stubComponents.catalystClient.getOwnedNames
              .onFirstCall()
              .resolves([
                {
                  id: '1',
                  name: 'testOwnedName',
                  contractAddress: '0x0000000000000000000000000000000000000000',
                  tokenId: '1'
                }
              ])
          })

          describe('and thumbnail is provided', () => {
            const validBodyWithThumbnail = {
              ...validBody,
              thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
            }

            let expectedCdn: string

            beforeEach(async () => {
              expectedCdn = await components.config.requireString('CDN_URL')
            })

            it('should respond with a 201 status code', async () => {
              const response = await makeMultipartRequest(identity, '/v1/communities', validBodyWithThumbnail)
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

            it('should return thumbnail raw url in the response', async () => {
              const response = await makeMultipartRequest(identity, '/v1/communities', validBodyWithThumbnail)
              const body = await response.json()
              communityId = body.data.id

              expect(body.data.thumbnails.raw).toBe(
                `${expectedCdn}/social/communities/${communityId}/raw-thumbnail.png`
              )
            })
          })

          describe('and thumbnail is not provided', () => {
            it('should create community even when the thumbnail is not provided', async () => {
              const response = await makeMultipartRequest(identity, '/v1/communities', validBody)
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
          })

          describe('but names cannot be fetched', () => {
            beforeEach(async () => {
              stubComponents.catalystClient.getOwnedNames.onFirstCall().rejects(new Error('Failed to fetch names'))
            })

            it('should respond with a 500 status code', async () => {
              const response = await makeMultipartRequest(identity, '/v1/communities', validBody)

              expect(response.status).toBe(500)
              expect(await response.json()).toMatchObject({ message: 'Failed to fetch names' })
            })
          })
        })

        describe('when the user does not own a name', () => {
          beforeEach(async () => {
            stubComponents.catalystClient.getOwnedNames.onFirstCall().resolves([])
          })

          it('should respond with a 401 status code', async () => {
            const response = await makeMultipartRequest(identity, '/v1/communities', validBody)

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
