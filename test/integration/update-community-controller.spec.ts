import { CommunityPrivacyEnum } from '../../src/logic/community'
import { CommunityRole } from '../../src/types'
import { test } from '../components'
import {
  createTestIdentity,
  Identity,
  makeAuthenticatedRequest,
  createAuthHeaders,
  makeAuthenticatedMultipartRequest
} from './utils/auth'
import { randomUUID } from 'crypto'
import FormData from 'form-data'
import { AIComplianceError, CommunityNotCompliantError } from '../../src/logic/community/errors'

test('Update Community Controller', async function ({ components, stubComponents }) {
  const makeMultipartRequest = makeAuthenticatedMultipartRequest(components)
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when updating a community', () => {
    let identity: Identity
    let communityId: string

    beforeEach(async () => {
      identity = await createTestIdentity()

      // Mock AI compliance to return compliant by default for community creation
      stubComponents.communityComplianceValidator.validateCommunityContent.resolves()

      // Create a test community first
      stubComponents.catalystClient.getOwnedNames.onFirstCall().resolves([
        {
          id: '1',
          name: 'testOwnedName',
          contractAddress: '0x0000000000000000000000000000000000000000',
          tokenId: '1'
        }
      ])

      stubComponents.catalystClient.getProfile.onFirstCall().resolves({
        avatars: [{ name: 'Owner Test Name' }]
      })

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
        if (places) {
          for (const place of places) {
            await components.communitiesDb.removeCommunityPlace(communityId, place.id)
          }
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
        describe('when AI compliance validation passes', () => {
          beforeEach(async () => {
            // Mock AI compliance to return compliant by default
            stubComponents.communityComplianceValidator.validateCommunityContent.resolves()
          })
          describe('when updating name only', () => {
            describe('and the user is the community owner', () => {
              it('should update the community name', async () => {
                const response = await makeMultipartRequest(
                  identity,
                  `/v1/communities/${communityId}`,
                  {
                    name: 'Updated Community Name'
                  },
                  'PUT'
                )

                expect(response.status).toBe(200)
                const body = await response.json()
                expect(body.data.name).toBe('Updated Community Name')
                expect(body.data.description).toBe('Original Description')
                expect(body.message).toBe('Community updated successfully')
              })

              describe('and the communiy is private', () => { 
                beforeEach(async () => {
                  await components.communitiesDb.updateCommunity(communityId, {
                    private: true
                  })
                })

                afterEach(async () => {
                  await components.communitiesDb.updateCommunity(communityId, {
                    private: false
                  })
                })

                it('should not switch the community to public', async () => {
                  const response = await makeMultipartRequest(
                    identity,
                    `/v1/communities/${communityId}`,
                    {
                      description: 'Updated Description'
                    },
                    'PUT'
                  )

                  expect(response.status).toBe(200)
                  const body = await response.json()
                  expect(body.data.description).toBe('Updated Description')
                  expect(body.data.privacy).toBe('private')
                })
              })
            })

            describe('and the user is not an administrator', () => {
              let nonAdminIdentity: Identity
              let nonAdminAddress: string

              beforeEach(async () => {
                nonAdminIdentity = await createTestIdentity()
                nonAdminAddress = nonAdminIdentity.realAccount.address.toLowerCase()

                // Add non-admin user as a regular member (no edit permissions)
                await components.communitiesDb.addCommunityMember({
                  communityId,
                  memberAddress: nonAdminAddress,
                  role: 'member' as any
                })
              })

              afterEach(async () => {
                if (nonAdminAddress) {
                  await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [nonAdminAddress])
                }
              })

              it('should respond with a 401 and an authorization error for lack of edit_info permission', async () => {
                const response = await makeMultipartRequest(
                  nonAdminIdentity,
                  `/v1/communities/${communityId}`,
                  {
                    name: 'Unauthorized Name Change'
                  },
                  'PUT'
                )

                expect(response.status).toBe(401)
                const body = await response.json()
                expect(body.error).toBe('Not Authorized')
              })
            })

            describe('and the user is a moderator', () => {
              let moderatorIdentity: Identity
              let moderatorAddress: string

              beforeEach(async () => {
                moderatorIdentity = await createTestIdentity()
                moderatorAddress = moderatorIdentity.realAccount.address.toLowerCase()

                // Add moderator user
                await components.communitiesDb.addCommunityMember({
                  communityId,
                  memberAddress: moderatorAddress,
                  role: 'moderator' as any
                })
              })

              afterEach(async () => {
                if (moderatorAddress) {
                  await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [moderatorAddress])
                }
              })

              it('should respond with a 401 and an authorization error for lack of edit_name permission', async () => {
                const response = await makeMultipartRequest(
                  moderatorIdentity,
                  `/v1/communities/${communityId}`,
                  {
                    name: 'Mod Unauthorized Change'
                  },
                  'PUT'
                )

                expect(response.status).toBe(401)
                const body = await response.json()
                expect(body.error).toBe('Not Authorized')
              })
            })
          })

          describe('when updating description only', () => {
            it('should update the community description', async () => {
              const response = await makeMultipartRequest(
                identity,
                `/v1/communities/${communityId}`,
                {
                  description: 'Updated Description'
                },
                'PUT'
              )

              expect(response.status).toBe(200)
              const body = await response.json()
              expect(body.data.name).toBe('Original Community')
              expect(body.data.description).toBe('Updated Description')
              expect(body.message).toBe('Community updated successfully')
            })

            describe('and the user is a moderator', () => {
              let moderatorIdentity: Identity
              let moderatorAddress: string

              beforeEach(async () => {
                moderatorIdentity = await createTestIdentity()
                moderatorAddress = moderatorIdentity.realAccount.address.toLowerCase()

                // Add moderator user with edit_info permission
                await components.communitiesDb.addCommunityMember({
                  communityId,
                  memberAddress: moderatorAddress,
                  role: 'moderator' as any // Moderators can edit info but not names
                })
              })

              afterEach(async () => {
                if (moderatorAddress) {
                  await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [moderatorAddress])
                }
              })

              it('should allow updating description when not changing name', async () => {
                const response = await makeMultipartRequest(
                  moderatorIdentity,
                  `/v1/communities/${communityId}`,
                  {
                    description: 'Description updated by moderator'
                  },
                  'PUT'
                )

                expect(response.status).toBe(200)
                const body = await response.json()
                expect(body.data.description).toBe('Description updated by moderator')
                expect(body.data.name).toBe('Original Community')
                expect(body.message).toBe('Community updated successfully')
              })
            })
          })

          describe('when updating placeIds', () => {
            let newPlaceIds: string[]

            describe('when updating name only', () => {
              it('should update the community name', async () => {
                const response = await makeMultipartRequest(
                  identity,
                  `/v1/communities/${communityId}`,
                  {
                    name: 'Updated Community Name'
                  },
                  'PUT'
                )

                expect(response.status).toBe(200)
                const body = await response.json()
                expect(body.data.name).toBe('Updated Community Name')
                expect(body.data.description).toBe('Original Description')
                expect(body.message).toBe('Community updated successfully')
              })
            })

            describe('when updating description only', () => {
              it('should update the community description', async () => {
                const response = await makeMultipartRequest(
                  identity,
                  `/v1/communities/${communityId}`,
                  {
                    description: 'Updated Description'
                  },
                  'PUT'
                )

                expect(response.status).toBe(200)
                const body = await response.json()
                expect(body.data.name).toBe('Original Community')
                expect(body.data.description).toBe('Updated Description')
                expect(body.message).toBe('Community updated successfully')
              })

              describe('and the communiy is private', () => { 
                beforeEach(async () => {
                  await components.communitiesDb.updateCommunity(communityId, {
                    private: true
                  })
                })

                afterEach(async () => {
                  await components.communitiesDb.updateCommunity(communityId, {
                    private: false
                  })
                })

                it('should not switch the community to public', async () => {
                  const response = await makeMultipartRequest(
                    identity,
                    `/v1/communities/${communityId}`,
                    {
                      description: 'Updated Description'
                    },
                    'PUT'
                  )

                  expect(response.status).toBe(200)
                  const body = await response.json()
                  expect(body.data.description).toBe('Updated Description')
                  expect(body.data.privacy).toBe('private')
                })
              })
            })

            describe('when updating placeIds', () => {
              let newPlaceIds: string[]
              beforeEach(async () => {
                newPlaceIds = [randomUUID(), randomUUID()]

                stubComponents.fetcher.fetch.onFirstCall().resolves({
                  ok: true,
                  status: 200,
                  json: () =>
                    Promise.resolve({
                      data: newPlaceIds.map((id) => ({
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
                const response = await makeMultipartRequest(
                  identity,
                  `/v1/communities/${communityId}`,
                  {
                    placeIds: newPlaceIds
                  },
                  'PUT'
                )

                expect(response.status).toBe(200)
                const body = await response.json()
                expect(body.message).toBe('Community updated successfully')

                const placesResponse = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'GET')
                expect(placesResponse.status).toBe(200)
                const placesResult = await placesResponse.json()
                expect(placesResult.data.results.map((p: { id: string }) => p.id)).toEqual(
                  expect.arrayContaining(newPlaceIds)
                )
              })

              it('should remove all places when empty array is provided', async () => {
                const response = await makeMultipartRequest(
                  identity,
                  `/v1/communities/${communityId}`,
                  {
                    placeIds: []
                  },
                  'PUT'
                )

                expect(response.status).toBe(200)
                const body = await response.json()
                expect(body.message).toBe('Community updated successfully')

                const placesResponse = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'GET')
                expect(placesResponse.status).toBe(200)
                const placesResult = await placesResponse.json()
                expect(placesResult.data.results).toHaveLength(0)
              })
            })

            describe('when updating without placeIds field', () => {
              it('should not modify places when placeIds field is not provided', async () => {
                // First, add some places to the community
                const initialPlaceIds = [randomUUID(), randomUUID()]

                stubComponents.fetcher.fetch.onFirstCall().resolves({
                  ok: true,
                  status: 200,
                  json: () =>
                    Promise.resolve({
                      data: initialPlaceIds.map((id) => ({
                        id,
                        title: 'Test Place',
                        positions: ['0,0,0'],
                        owner: identity.realAccount.address.toLowerCase()
                      }))
                    })
                } as any)

                await makeMultipartRequest(
                  identity,
                  `/v1/communities/${communityId}`,
                  {
                    placeIds: initialPlaceIds
                  },
                  'PUT'
                )

                // Verify places were added
                let placesResponse = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'GET')
                expect(placesResponse.status).toBe(200)
                let placesResult = await placesResponse.json()
                expect(placesResult.data.results.map((p: { id: string }) => p.id)).toEqual(
                  expect.arrayContaining(initialPlaceIds)
                )

                // Now update without placeIds field
                const response = await makeMultipartRequest(
                  identity,
                  `/v1/communities/${communityId}`,
                  {
                    name: 'Updated Without Places'
                  },
                  'PUT'
                )

                expect(response.status).toBe(200)
                const body = await response.json()
                expect(body.data.name).toBe('Updated Without Places')
                expect(body.message).toBe('Community updated successfully')

                // Verify places remain unchanged
                placesResponse = await makeRequest(identity, `/v1/communities/${communityId}/places`, 'GET')
                expect(placesResponse.status).toBe(200)
                placesResult = await placesResponse.json()
                expect(placesResult.data.results.map((p: { id: string }) => p.id)).toEqual(
                  expect.arrayContaining(initialPlaceIds)
                )

                // Cleanup
                for (const placeId of initialPlaceIds) {
                  await components.communitiesDb.removeCommunityPlace(communityId, placeId)
                }
              })
            })


            describe('when updating multiple fields', () => {
              it('should update all provided fields', async () => {
                const response = await makeMultipartRequest(
                  identity,
                  `/v1/communities/${communityId}`,
                  {
                    name: 'Multi Updated Name',
                    description: 'Multi Updated Description'
                  },
                  'PUT'
                )

                expect(response.status).toBe(200)
                const body = await response.json()
                expect(body.data.name).toBe('Multi Updated Name')
                expect(body.data.description).toBe('Multi Updated Description')
                expect(body.message).toBe('Community updated successfully')
              })
            })

            describe('when updating privacy', () => {
              describe('and the user is the owner', () => {
                it('should update the community privacy', async () => {
                  const response = await makeMultipartRequest(
                    identity,
                    `/v1/communities/${communityId}`,
                    {
                      privacy: CommunityPrivacyEnum.Private
                    },
                    'PUT'
                  )

                  expect(response.status).toBe(200)
                  const body = await response.json()
                  expect(body.data.privacy).toBe(CommunityPrivacyEnum.Private)
                  expect(body.message).toBe('Community updated successfully')
                })

                it('should not update the community privacy if it contains a invalid value', async () => {
                  const existingCommunity = await components.communitiesDb.getCommunity(communityId, identity.realAccount.address)
                  const response = await makeMultipartRequest(
                    identity,
                    `/v1/communities/${communityId}`,
                    {
                      name: 'Provoke any change',
                      privacy: 'invalid' as any
                    },
                    'PUT'
                  )

                  expect(response.status).toBe(200)
                  const body = await response.json()
                  expect(body.data.privacy).toBe(existingCommunity.privacy)
                  expect(body.message).toBe('Community updated successfully')
                })
              })

              describe('and the user is not the owner', () => {
                beforeEach(async () => {
                  await components.communitiesDb.updateMemberRole(
                    communityId,
                    identity.realAccount.address,
                    CommunityRole.Moderator
                  )
                })

                afterEach(async () => {
                  await components.communitiesDb.updateMemberRole(
                    communityId,
                    identity.realAccount.address,
                    CommunityRole.Owner
                  )
                })

                it('should respond with a 401 status code', async () => {
                  const response = await makeMultipartRequest(
                    identity,
                    `/v1/communities/${communityId}`,
                    {
                      privacy: CommunityPrivacyEnum.Private
                    },
                    'PUT'
                  )

                  expect(response.status).toBe(401)
                })
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

          it('should respond with a 400 status code when updating with non-compliant content', async () => {
            const response = await makeMultipartRequest(
              identity,
              `/v1/communities/${communityId}`,
              {
                name: 'Violent Community Update',
                description: 'A community that promotes violence and inappropriate content'
              },
              'PUT'
            )

            expect(response.status).toBe(400)
            const body = await response.json()
            expect(body.error).toBe('Community not compliant')
            expect(body.message).toContain("Community content violates Decentraland's Code of Ethics")
            expect(body.data.issues).toEqual({
              name: ['Contains inappropriate language', 'Promotes violence']
            })
          })

          it('should respond with a 400 status code when updating thumbnail with non-compliant content', async () => {
            const response = await makeMultipartRequest(
              identity,
              `/v1/communities/${communityId}`,
              {
                name: 'Updated Name',
                thumbnailPath: require('path').join(__dirname, 'fixtures/example.png')
              },
              'PUT'
            )

            expect(response.status).toBe(400)
            const body = await response.json()
            expect(body.error).toBe('Community not compliant')
            expect(body.message).toContain("Community content violates Decentraland's Code of Ethics")
          })
        })

        describe('and AI compliance validation fails with AIComplianceError', () => {
          beforeEach(async () => {
            stubComponents.communityComplianceValidator.validateCommunityContent.rejects(
              new AIComplianceError('AI compliance validation failed')
            )
          })

          it('should respond with a 400 status code for AIComplianceError', async () => {
            const response = await makeMultipartRequest(
              identity,
              `/v1/communities/${communityId}`,
              {
                name: 'Updated Name'
              },
              'PUT'
            )

            expect(response.status).toBe(400)
            const body = await response.json()
            expect(body.error).toBe('Community content validation unavailable')
            expect(body.message).toBe('AI compliance validation failed')
            expect(body.communityContentValidationUnavailable).toBe(true)
          })
        })
      })

      describe('and the user is not authorized', () => {
        let otherIdentity: Identity

        beforeEach(async () => {
          otherIdentity = await createTestIdentity()
        })

        it('should respond with a 401 status code', async () => {
          const response = await makeMultipartRequest(
            otherIdentity,
            `/v1/communities/${communityId}`,
            {
              name: 'Unauthorized Update'
            },
            'PUT'
          )

          expect(response.status).toBe(401)
        })
      })

      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeMultipartRequest(
            identity,
            `/v1/communities/${nonExistentId}`,
            {
              name: 'Non Existent Update'
            },
            'PUT'
          )

          expect(response.status).toBe(404)
        })
      })

      describe('and invalid data is provided', () => {
        it('should respond with a 400 status code for empty name', async () => {
          const response = await makeMultipartRequest(
            identity,
            `/v1/communities/${communityId}`,
            {
              name: ''
            },
            'PUT'
          )

          expect(response.status).toBe(400)
        })

        it('should respond with a 400 status code for empty description', async () => {
          const response = await makeMultipartRequest(
            identity,
            `/v1/communities/${communityId}`,
            {
              name: 'Updated name',
              description: ''
            },
            'PUT'
          )

          expect(response.status).toBe(400)
        })

        it('should respond with a 400 status code when name exceeds 30 characters', async () => {
          const longName = 'A'.repeat(31) // 31 characters, exceeds 30 limit
          const response = await makeMultipartRequest(
            identity,
            `/v1/communities/${communityId}`,
            {
              name: longName,
              description: 'Updated description'
            },
            'PUT'
          )

          expect(response.status).toBe(400)
          expect(await response.json()).toMatchObject({
            error: 'Bad request',
            message: 'Name must be less or equal to 30 characters'
          })
        })

        it('should respond with a 400 status code when description exceeds 500 characters', async () => {
          const longDescription = 'A'.repeat(501) // 501 characters, exceeds 500 limit
          const response = await makeMultipartRequest(
            identity,
            `/v1/communities/${communityId}`,
            {
              name: 'Updated name',
              description: longDescription
            },
            'PUT'
          )

          expect(response.status).toBe(400)
          expect(await response.json()).toMatchObject({
            error: 'Bad request',
            message: 'Description must be less or equal to 500 characters'
          })
        })

        it('should respond with a 400 status code when name is restricted', async () => {
          const response = await makeMultipartRequest(
            identity,
            `/v1/communities/${communityId}`,
            {
              name: 'Restricted name'
            },
            'PUT'
          )

          expect(response.status).toBe(400)
          expect(await response.json()).toMatchObject({
            error: 'Bad request',
            message: 'Name is not allowed'
          })
        })

        it('should respond with a 400 status code when name is restricted (case insensitive)', async () => {
          const response = await makeMultipartRequest(
            identity,
            `/v1/communities/${communityId}`,
            {
              name: 'ANOTHER NOT ALLOWED NAME'
            },
            'PUT'
          )

          expect(response.status).toBe(400)
          expect(await response.json()).toMatchObject({
            error: 'Bad request',
            message: 'Name is not allowed'
          })
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
          const response = await makeMultipartRequest(
            identity,
            `/v1/communities/${communityId}`,
            {
              thumbnailPath: require('path').join(__dirname, 'fixtures/example.txt')
            },
            'PUT'
          )

          expect(response.status).toBe(400)
        })
      })
    })
  })
})
