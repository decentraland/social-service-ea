import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest, createAuthHeaders, makeAuthenticatedMultipartRequest } from './utils/auth'
import { randomUUID } from 'crypto'
import FormData from 'form-data'

test('Update Community Controller', async function ({ components, stubComponents }) {
  const makeMultipartRequest = makeAuthenticatedMultipartRequest(components)
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when updating a community', () => {
    let identity: Identity
    let communityId: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      
      // Create a test community first
      stubComponents.catalystClient.getOwnedNames.onFirstCall().resolves([
        {
          id: '1',
          name: 'testOwnedName',
          contractAddress: '0x0000000000000000000000000000000000000000',
          tokenId: '1'
        }
      ])

      const createForm = new FormData()
      createForm.append('name', 'Original Community')
      createForm.append('description', 'Original Description')
      
      const createHeaders = {
        ...createAuthHeaders('POST', '/v1/communities', {}, identity)
      }

      const createResponse = await components.localHttpFetch.fetch('/v1/communities', {
        method: 'POST',
        headers: createHeaders,
        body: createForm as any
      })

      const createBody = await createResponse.json()
      communityId = createBody.data.id
    })

    afterEach(async () => {
      if (communityId) {
        await components.communitiesDb.deleteCommunity(communityId)
        await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [identity.realAccount.address])
        const places = await components.communitiesDb.getCommunityPlaces(communityId, {
          limit: 1000,
          offset: 0
        })
        for (const place of places) {
          await components.communitiesDb.removeCommunityPlace(communityId, place.id)
        }
      }
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}`, { method: 'PUT' })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and valid fields are provided', () => {
        describe('when updating name only', () => {
          it('should update the community name', async () => {
            const response = await makeMultipartRequest(identity, `/v1/communities/${communityId}`, {
              name: 'Updated Community Name'
            }, 'PUT')

            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data.name).toBe('Updated Community Name')
            expect(body.data.description).toBe('Original Description')
            expect(body.message).toBe('Community updated successfully')
          })
        })

        describe('when updating description only', () => {
          it('should update the community description', async () => {
            const response = await makeMultipartRequest(identity, `/v1/communities/${communityId}`, {
              description: 'Updated Description'
            }, 'PUT')

            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data.name).toBe('Original Community')
            expect(body.data.description).toBe('Updated Description')
            expect(body.message).toBe('Community updated successfully')
          })
        })

        describe('when updating placeIds', () => {
          let newPlaceIds: string[]
          beforeEach(async () => {
            newPlaceIds = [randomUUID(), randomUUID()]
            
            stubComponents.fetcher.fetch.onFirstCall().resolves({
              ok: true,
              status: 200,
              json: () => Promise.resolve({
                data: newPlaceIds.map(id => ({
                  id,
                  title: 'Test Place',
                  positions: ['0,0,0'],
                  owner: identity.realAccount.address.toLowerCase()
                }))
              })
            } as any)
          })

          afterEach(async () => {
            await components.communitiesDb.removeCommunityPlace(communityId, newPlaceIds[0])
            await components.communitiesDb.removeCommunityPlace(communityId, newPlaceIds[1])
          })

          it('should replace all community places with new ones', async () => {
            const response = await makeMultipartRequest(identity, `/v1/communities/${communityId}`, {
              placeIds: newPlaceIds
            }, 'PUT')

            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.message).toBe('Community updated successfully')

            const placesResponse = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'GET')
            expect(placesResponse.status).toBe(200)
            const placesResult = await placesResponse.json()
            expect(placesResult.data.results.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining(newPlaceIds))
          })

          it('should remove all places when empty array is provided', async () => {
            const response = await makeMultipartRequest(identity, `/v1/communities/${communityId}`, {
              placeIds: []
            }, 'PUT')

            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.message).toBe('Community updated successfully')

            const placesResponse = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'GET')
            expect(placesResponse.status).toBe(200)
            const placesResult = await placesResponse.json()
            expect(placesResult.data.results).toHaveLength(0)
          })
        })

        describe('when updating with thumbnail', () => {
          it('should update the community with new thumbnail', async () => {
            const response = await makeMultipartRequest(identity, `/v1/communities/${communityId}`, {
              name: 'Thumbnail Updated',
              thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
            }, 'PUT')

            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data.name).toBe('Thumbnail Updated')
            expect(body.data.thumbnails).toBeDefined()
            expect(body.data.thumbnails.raw).toContain('social/communities/')
            expect(body.message).toBe('Community updated successfully')
          })
        })

        describe('when updating multiple fields', () => {
          it('should update all provided fields', async () => {
            const response = await makeMultipartRequest(identity, `/v1/communities/${communityId}`, {
              name: 'Multi Updated Name',
              description: 'Multi Updated Description'
            }, 'PUT')

            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data.name).toBe('Multi Updated Name')
            expect(body.data.description).toBe('Multi Updated Description')
            expect(body.message).toBe('Community updated successfully')
          })
        })
      })

      describe('but the user is not authorized', () => {
        let otherIdentity: Identity

        beforeEach(async () => {
          otherIdentity = await createTestIdentity()
        })

        it('should respond with a 401 status code', async () => {
          const response = await makeMultipartRequest(otherIdentity, `/v1/communities/${communityId}`, {
            name: 'Unauthorized Update'
          }, 'PUT')

          expect(response.status).toBe(401)
        })
      })

      describe('but the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeMultipartRequest(identity, `/v1/communities/${nonExistentId}`, {
            name: 'Non Existent Update'
          }, 'PUT')

          expect(response.status).toBe(404)
        })
      })

      describe('but invalid data is provided', () => {
        it('should respond with a 400 status code for empty name', async () => {
          const response = await makeMultipartRequest(identity, `/v1/communities/${communityId}`, {
            name: ''
          }, 'PUT')

          expect(response.status).toBe(400)
        })

        it('should respond with a 400 status code for empty description', async () => {
          const response = await makeMultipartRequest(identity, `/v1/communities/${communityId}`, {
            description: ''
          }, 'PUT')

          expect(response.status).toBe(400)
        })

        it('should respond with a 400 status code for invalid placeIds JSON', async () => {
          const form = new FormData()
          form.append('placeIds', 'invalid json')
          
          const headers = {
            ...createAuthHeaders('PUT', `/v1/communities/${communityId}`, {}, identity)
          }

          const response = await components.localHttpFetch.fetch(`/v1/communities/${communityId}`, {
            method: 'PUT',
            headers,
            body: form as any
          })

          expect(response.status).toBe(400)
        })

        it('should respond with a 400 status code when placeIds is not an array', async () => {
          const form = new FormData()
          form.append('placeIds', '"not an array"')
          
          const headers = {
            ...createAuthHeaders('PUT', `/v1/communities/${communityId}`, {}, identity)
          }

          const response = await components.localHttpFetch.fetch(`/v1/communities/${communityId}`, {
            method: 'PUT',
            headers,
            body: form as any
          })

          expect(response.status).toBe(400)
        })

        it('should respond with a 400 status code for invalid thumbnail', async () => {
          const response = await makeMultipartRequest(identity, `/v1/communities/${communityId}`, {
            thumbnailPath: require('path').join(__dirname, 'fixtures/example.txt')
          }, 'PUT')

          expect(response.status).toBe(400)
        })
      })
    })
  })
})
