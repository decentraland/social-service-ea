import { CommunityPrivacyEnum } from '../../src/logic/community'
import { test } from '../components'
import { createMockProfile } from '../mocks/profile'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { makeAuthenticatedMultipartRequest } from './utils/auth'
import { randomUUID } from 'crypto'
import { Jimp, rgbaToInt } from 'jimp'
import { AIComplianceError, CommunityNotCompliantError } from '../../src/logic/community/errors'

export async function createLargeThumbnailBuffer(targetSize = 501 * 1024): Promise<Buffer> {
  let width = 1000
  let height = 1000
  let buffer: Buffer

  while (true) {
    const image = new Jimp({ width, height })
    // Fill with random pixels to avoid compression
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const color = rgbaToInt(
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
          255
        )
        image.setPixelColor(color, x, y)
      }
    }
    buffer = await image.getBuffer('image/png')
    if (buffer.length >= targetSize) break
    // Increase size for next iteration
    width += 100
    height += 100
  }

  return buffer
}

test('Create Community Controller', async function ({ components, stubComponents }) {
  const makeMultipartRequest = makeAuthenticatedMultipartRequest(components)
  const makeRequest = makeAuthenticatedRequest(components)

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
      describe('and the body structure is invalid', () => {
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

        it('should respond with a 400 status code when name exceeds 30 characters', async () => {
          const longName = 'A'.repeat(31) // 31 characters, exceeds 30 limit
          const response = await makeMultipartRequest(identity, '/v1/communities', {
            name: longName,
            description: 'Test Description',
            thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
          })

          expect(response.status).toBe(400)
          expect(await response.json()).toMatchObject({
            error: 'Bad request',
            message: 'Name must be less or equal to 30 characters'
          })
        })

        it('should respond with a 400 status code when name is restricted', async () => {
          const response = await makeMultipartRequest(identity, '/v1/communities', {
            name: 'Restricted name',
            description: 'Test Description',
            thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
          })

          expect(response.status).toBe(400)
          expect(await response.json()).toMatchObject({
            error: 'Bad request',
            message: 'Name is not allowed'
          })
        })

        it('should respond with a 400 status code when name is restricted (case insensitive)', async () => {
          const response = await makeMultipartRequest(identity, '/v1/communities', {
            name: 'RESTRICTED NAME',
            description: 'Test Description',
            thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
          })

          expect(response.status).toBe(400)
          expect(await response.json()).toMatchObject({
            error: 'Bad request',
            message: 'Name is not allowed'
          })
        })

        it('should respond with a 400 status code when description exceeds 500 characters', async () => {
          const longDescription = 'A'.repeat(501) // 501 characters, exceeds 500 limit
          const response = await makeMultipartRequest(identity, '/v1/communities', {
            name: 'Test Community',
            description: longDescription,
            thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
          })

          expect(response.status).toBe(400)
          expect(await response.json()).toMatchObject({
            error: 'Bad request',
            message: 'Description must be less or equal to 500 characters'
          })
        })

        it('should respond with a 400 status code for invalid placeIds JSON', async () => {
          const response = await makeMultipartRequest(identity, '/v1/communities', {
            name: 'Test Community',
            description: 'Test Description',
            placeIds: 'invalid json' as any,
            thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
          })

          expect(response.status).toBe(400)
          expect(await response.json()).toMatchObject({
            error: 'Bad request',
            message: 'placeIds must be a valid JSON array'
          })
        })

        it('should respond with a 400 status code when placeIds is not an array', async () => {
          const response = await makeMultipartRequest(identity, '/v1/communities', {
            placeIds: '"not an array"' as any,
            thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
          })

          expect(response.status).toBe(400)
          expect(await response.json()).toMatchObject({
            error: 'Bad request',
            message: 'placeIds must be a valid JSON array'
          })
        })
      })

      describe('and the body structure is valid', () => {
        let communityId: string
        let validBody: {
          name: string
          description: string
          privacy: CommunityPrivacyEnum
          thumbnailPath?: string
          placeIds?: string[]
        }

        beforeEach(() => {
          validBody = {
            name: 'Test Community',
            description: 'Test Description',
            privacy: CommunityPrivacyEnum.Public
          }
        })

        afterEach(async () => {
          if (communityId) {
            await components.communitiesDb.deleteCommunity(communityId)
          }
        })

        describe('when the user owns a name', () => {
          beforeEach(async () => {
            stubComponents.catalystClient.getOwnedNames.onFirstCall().resolves([
              {
                id: '1',
                name: 'testOwnedName',
                contractAddress: '0x0000000000000000000000000000000000000000',
                tokenId: '1'
              }
            ])
            stubComponents.catalystClient.getProfile
              .onFirstCall()
              .resolves(createMockProfile(identity.realAccount.address.toLowerCase()))
          })

          describe('and AI compliance validation passes', () => {
            beforeEach(async () => {
              // Mock AI compliance to return compliant by default
              stubComponents.communityComplianceValidator.validateCommunityContent.resolves()
            })

            describe('and places are provided', () => {
              let mockPlaceIds: string[]
              let validBodyWithPlaces

              beforeEach(() => {
                mockPlaceIds = [randomUUID(), randomUUID()]
                validBodyWithPlaces = {
                  ...validBody,
                  placeIds: mockPlaceIds
                }
              })

              describe('and the places are owned by the user', () => {
                beforeEach(async () => {
                  stubComponents.fetcher.fetch.onFirstCall().resolves({
                    ok: true,
                    status: 200,
                    json: () =>
                      Promise.resolve({
                        data: mockPlaceIds.map((id) => ({
                          id,
                          title: 'Test Place',
                          positions: ['0,0,0'],
                          owner: identity.realAccount.address.toLowerCase()
                        }))
                      })
                  } as any)
                })

                it('should create community and add places', async () => {
                  const response = await makeMultipartRequest(identity, '/v1/communities', validBodyWithPlaces)
                  const body = await response.json()
                  communityId = body.data.id

                  // Wait for any setImmediate callbacks to complete
                  await new Promise(resolve => setImmediate(resolve))

                  expect(response.status).toBe(201)
                  expect(body).toMatchObject({
                    data: {
                      id: expect.any(String),
                      name: 'Test Community',
                      description: 'Test Description',
                      active: true,
                      ownerAddress: identity.realAccount.address.toLowerCase(),
                      privacy: CommunityPrivacyEnum.Public
                    },
                    message: 'Community created successfully'
                  })

                  const placesResponse = await makeRequest(identity, `/v1/communities/${communityId}/places`)
                  expect(placesResponse.status).toBe(200)
                  const result = await placesResponse.json()
                  expect(result.data.results.map((p: { id: string }) => p.id)).toEqual(
                    expect.arrayContaining(mockPlaceIds)
                  )
                })

                it('should create community without places when empty array is provided', async () => {
                  const validBodyWithEmptyPlaces = {
                    ...validBody,
                    placeIds: []
                  }

                  const response = await makeMultipartRequest(identity, '/v1/communities', validBodyWithEmptyPlaces)
                  const body = await response.json()
                  communityId = body.data.id

                  expect(response.status).toBe(201)

                  const placesResponse = await makeRequest(identity, `/v1/communities/${communityId}/places`)
                  expect(placesResponse.status).toBe(200)
                  const result = await placesResponse.json()
                  expect(result.data.results).toHaveLength(0)
                })
              })
            })

            describe('and a valid thumbnail is provided', () => {
              let validBodyWithThumbnail

              let expectedCdn: string

              beforeEach(async () => {
                validBodyWithThumbnail = {
                  ...validBody,
                  thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
                }

                expectedCdn = await components.config.requireString('CDN_URL')
              })

              it('should respond with a 201 status code', async () => {
                const response = await makeMultipartRequest(identity, '/v1/communities', validBodyWithThumbnail)
                const body = await response.json()
                communityId = body.data.id

                // Wait for any setImmediate callbacks to complete
                await new Promise(resolve => setImmediate(resolve))

                expect(response.status).toBe(201)
                expect(body).toMatchObject({
                  data: {
                    id: expect.any(String),
                    name: 'Test Community',
                    description: 'Test Description',
                    active: true,
                    ownerAddress: identity.realAccount.address.toLowerCase(),
                    privacy: CommunityPrivacyEnum.Public
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

            describe('and an invalid thumbnail is provided', () => {
              it('should respond with a 400 status code when trying to upload a file that is not an image', async () => {
                const response = await makeMultipartRequest(identity, '/v1/communities', {
                  ...validBody,
                  thumbnailPath: require('path').join(__dirname, 'fixtures/example.txt')
                })
                expect(response.status).toBe(400)
                expect(await response.json()).toMatchObject({
                  message: 'Thumbnail must be a valid image file'
                })
              })

              it('should respond with a 400 status code when trying to upload a file that is too large', async () => {
                const response = await makeMultipartRequest(identity, '/v1/communities', {
                  ...validBody,
                  thumbnailBuffer: await createLargeThumbnailBuffer()
                })
                expect(response.status).toBe(400)
                expect(await response.json()).toMatchObject({
                  message: 'Thumbnail size must be between 1KB and 500KB'
                })
              }, 10000) // 10 second timeout for large thumbnail generation
            })

            describe('and thumbnail is not provided', () => {
              it('should create community even when the thumbnail is not provided', async () => {
                const response = await makeMultipartRequest(identity, '/v1/communities', validBody)
                const body = await response.json()
                communityId = body.data.id

                // Wait for any setImmediate callbacks to complete
                await new Promise(resolve => setImmediate(resolve))

                expect(response.status).toBe(201)
                expect(body).toMatchObject({
                  data: {
                    id: expect.any(String),
                    name: 'Test Community',
                    description: 'Test Description',
                    active: true,
                    ownerAddress: identity.realAccount.address.toLowerCase(),
                    privacy: CommunityPrivacyEnum.Public
                  },
                  message: 'Community created successfully'
                })
              })
            })

            describe('and the community privacy is private', () => {
              beforeEach(() => {
                validBody.privacy = CommunityPrivacyEnum.Private
              })

              it('should respond with a 201 and the created community with private privacy', async () => {
                const response = await makeMultipartRequest(identity, '/v1/communities', validBody)
                const body = await response.json()
                communityId = body.data.id

                // Wait for any setImmediate callbacks to complete
                await new Promise(resolve => setImmediate(resolve))

                expect(response.status).toBe(201)
                expect(body).toMatchObject({
                  data: {
                    id: expect.any(String),
                    name: 'Test Community',
                    description: 'Test Description',
                    active: true,
                    ownerAddress: identity.realAccount.address.toLowerCase(),
                    privacy: CommunityPrivacyEnum.Private
                  },
                  message: 'Community created successfully'
                })
              })
            })
          })

          describe('and AI compliance validation fails', () => {
            beforeEach(async () => {
              // Mock AI compliance to return non-compliant
              stubComponents.communityComplianceValidator.validateCommunityContent.rejects(
                new CommunityNotCompliantError(
                  "Community content violates Decentraland's Code of Ethics",
                  { name: ['Contains inappropriate language', 'Promotes violence'] },
                  0.9
                )
              )
            })

            it('should respond with a 400 status code for non-compliant content', async () => {
              const response = await makeMultipartRequest(identity, '/v1/communities', {
                name: 'Violent Community',
                description: 'A community that promotes violence and inappropriate content',
                privacy: CommunityPrivacyEnum.Public
              })

              expect(response.status).toBe(400)
              const body = await response.json()
              expect(body.error).toBe('Community not compliant')
              expect(body.message).toContain("Community content violates Decentraland's Code of Ethics")
              expect(body.data.issues).toEqual({
                name: ['Contains inappropriate language', 'Promotes violence']
              })
            })
          })

          describe('and AI compliance validation fails with AIComplianceError', () => {
            beforeEach(async () => {
              stubComponents.communityComplianceValidator.validateCommunityContent.rejects(
                new AIComplianceError('AI compliance validation failed')
              )
            })

            it('should respond with a 400 status code for AIComplianceError', async () => {
              const response = await makeMultipartRequest(identity, '/v1/communities', validBody)

              expect(response.status).toBe(400)
              const body = await response.json()
              expect(body.error).toBe('Community content validation unavailable')
              expect(body.message).toBe('AI compliance validation failed')
              expect(body.communityContentValidationUnavailable).toBe(true)
            })
          })

          describe('and names cannot be fetched', () => {
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
