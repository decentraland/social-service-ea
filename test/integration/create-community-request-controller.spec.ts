import { CommunityRequestType, CommunityRequestStatus } from '../../src/logic/community'
import { CommunityRole } from '../../src/types/entities'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest, createAuthHeaders } from './utils/auth'
import { mockCommunity } from '../mocks/communities'
import { randomUUID } from 'crypto'
import { EthAddress } from '@dcl/schemas'

test('Create Community Request Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when creating a community request', () => {
    let identity: Identity
    let communityId: string
    let ownerAddress: string
    let targetAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      ownerAddress = identity.realAccount.address.toLowerCase()
      targetAddress = '0x0000000000000000000000000000000000000002'
    })

    afterEach(async () => {
      // Clean up community requests
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    describe('when the request is not authenticated', () => {
      it('should return 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            targetedAddress: targetAddress,
            type: CommunityRequestType.Invite
          })
        })
        expect(response.status).toBe(400)
      })
    })

    describe('when the request is authenticated', () => {
      describe('and targetedAddress is missing in body', () => {
        it('should return 400 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/requests`, 'POST', {
            type: CommunityRequestType.Invite
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and type is missing in body', () => {
        it('should return 400 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/requests`, 'POST', {
            targetedAddress: targetAddress
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and targetedAddress is not a valid EthAddress', () => {
        it('should return 400 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/requests`, 'POST', {
            targetedAddress: 'invalid-address',
            type: CommunityRequestType.Invite
          })
          expect(response.status).toBe(400)
          const body = await response.json()
          expect(body.message).toBe('Invalid targeted address')
        })
      })

      describe('and targetedAddress is empty string', () => {
        it('should return 400 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/requests`, 'POST', {
            targetedAddress: '',
            type: CommunityRequestType.Invite
          })
          expect(response.status).toBe(400)
          const body = await response.json()
          expect(body.message).toBe('Missing targetedAddress or type field')
        })
      })

      describe('and type is not a valid CommunityRequestType', () => {
        it('should return 400 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/requests`, 'POST', {
            targetedAddress: targetAddress,
            type: 'invalid-type'
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and the request body is not valid JSON', () => {
        it('should return 400 status code', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/requests`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...createAuthHeaders('POST', `/v1/communities/${communityId}/requests`, {}, identity)
            },
            body: 'invalid json'
          })
          expect(response.status).toBe(400)
        })

        describe('when body is empty', () => {
          it('should return 400 status code', async () => {
            const { localHttpFetch } = components
            const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/requests`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...createAuthHeaders('POST', `/v1/communities/${communityId}/requests`, {}, identity)
              },
              body: ''
            })
            expect(response.status).toBe(400)
          })
        })
      })

      describe('and the request body is valid', () => {
        let requestBody: { targetedAddress: string; type: CommunityRequestType }

        beforeEach(async () => {
          requestBody = {
            targetedAddress: targetAddress,
            type: CommunityRequestType.Invite
          }
        })

        describe('and request type is invite', () => {
          beforeEach(() => {
            requestBody = {
              ...requestBody,
              type: CommunityRequestType.Invite
            }
          })

          describe('when community exists', () => {
            beforeEach(async () => {
              const result = await components.communitiesDb.createCommunity(
                mockCommunity({
                  name: 'Test Community',
                  description: 'Test Description',
                  owner_address: ownerAddress,
                  private: false
                })
              )
              communityId = result.id

              await components.communitiesDb.addCommunityMember({
                communityId,
                memberAddress: ownerAddress,
                role: CommunityRole.Owner
              })
            })

            describe('and community is private', () => {
              beforeEach(async () => {
                await components.communitiesDb.updateCommunity(communityId, {
                  private: true
                })
              })

              describe('and user is not a member', () => {
                describe('and no pending invite exists', () => {
                  it('should return 200 status code and return the created request', async () => {
                    const response = await makeRequest(
                      identity,
                      `/v1/communities/${communityId}/requests`,
                      'POST',
                      requestBody
                    )
                    expect(response.status).toBe(200)
                    const body = await response.json()
                    expect(body.data).toMatchObject({
                      id: expect.any(String),
                      communityId,
                      memberAddress: targetAddress,
                      type: CommunityRequestType.Invite,
                      status: CommunityRequestStatus.Pending
                    })
                  })
                })

                describe('when a pending invite already exists', () => {
                  beforeEach(async () => {
                    await components.communitiesDb.createCommunityRequest(
                      communityId,
                      targetAddress as EthAddress,
                      CommunityRequestType.Invite
                    )
                  })

                  it('should return 400 status code', async () => {
                    const response = await makeRequest(
                      identity,
                      `/v1/communities/${communityId}/requests`,
                      'POST',
                      requestBody
                    )
                    expect(response.status).toBe(400)
                    const body = await response.json()
                    expect(body.message).toBe('Request already exists')
                  })
                })
              })

              describe('when user is already a member', () => {
                beforeEach(async () => {
                  await components.communitiesDb.addCommunityMember({
                    communityId,
                    memberAddress: targetAddress,
                    role: CommunityRole.Member
                  })
                })

                it('should return 400 status code', async () => {
                  const response = await makeRequest(
                    identity,
                    `/v1/communities/${communityId}/requests`,
                    'POST',
                    requestBody
                  )
                  expect(response.status).toBe(400)
                  const body = await response.json()
                  expect(body.message).toContain('User cannot join since it is already a member')
                })
              })
            })

            describe('and community is public', () => {
              beforeEach(async () => {
                await components.communitiesDb.updateCommunity(communityId, {
                  private: false
                })
              })

              describe('and user is not a member', () => {
                describe('and no pending invite exists', () => {
                  it('should return 200 status code and return the created request', async () => {
                    const response = await makeRequest(
                      identity,
                      `/v1/communities/${communityId}/requests`,
                      'POST',
                      requestBody
                    )
                    expect(response.status).toBe(200)
                    const body = await response.json()
                    expect(body.data).toMatchObject({
                      id: expect.any(String),
                      communityId,
                      memberAddress: targetAddress,
                      type: CommunityRequestType.Invite,
                      status: CommunityRequestStatus.Pending
                    })
                  })
                })

                describe('when a pending invite already exists', () => {
                  beforeEach(async () => {
                    await components.communitiesDb.createCommunityRequest(
                      communityId,
                      targetAddress as EthAddress,
                      CommunityRequestType.Invite
                    )
                  })

                  it('should return 400 status code', async () => {
                    const response = await makeRequest(
                      identity,
                      `/v1/communities/${communityId}/requests`,
                      'POST',
                      requestBody
                    )
                    expect(response.status).toBe(400)
                    const body = await response.json()
                    expect(body.message).toBe('Request already exists')
                  })
                })
              })

              describe('when user is already a member', () => {
                beforeEach(async () => {
                  await components.communitiesDb.addCommunityMember({
                    communityId,
                    memberAddress: targetAddress,
                    role: CommunityRole.Member
                  })
                })

                it('should return 400 status code', async () => {
                  const response = await makeRequest(
                    identity,
                    `/v1/communities/${communityId}/requests`,
                    'POST',
                    requestBody
                  )
                  expect(response.status).toBe(400)
                  const body = await response.json()
                  expect(body.message).toContain('User cannot join since it is already a member')
                })
              })
            })
          })

          describe('when community does not exist', () => {
            it('should return 404 status code', async () => {
              const nonExistentId = randomUUID()
              const response = await makeRequest(
                identity,
                `/v1/communities/${nonExistentId}/requests`,
                'POST',
                requestBody
              )
              expect(response.status).toBe(404)
            })
          })
        })

        describe('and request type is request_to_join', () => {
          beforeEach(() => {
            requestBody = {
              ...requestBody,
              type: CommunityRequestType.RequestToJoin
            }
          })
          describe('when community exists', () => {
            beforeEach(async () => {
              const result = await components.communitiesDb.createCommunity(
                mockCommunity({
                  name: 'Test Community',
                  description: 'Test Description',
                  owner_address: ownerAddress,
                  private: false
                })
              )
              communityId = result.id

              await components.communitiesDb.addCommunityMember({
                communityId,
                memberAddress: ownerAddress,
                role: CommunityRole.Owner
              })
            })

            describe('and community is private', () => {
              beforeEach(async () => {
                await components.communitiesDb.updateCommunity(communityId, {
                  private: true
                })
              })

              describe('and user is not a member', () => {
                describe('and no pending request exists', () => {
                  it('should return 200 status code and return the created request', async () => {
                    const response = await makeRequest(
                      identity,
                      `/v1/communities/${communityId}/requests`,
                      'POST',
                      requestBody
                    )
                    expect(response.status).toBe(200)
                    const body = await response.json()
                    expect(body.data).toMatchObject({
                      id: expect.any(String),
                      communityId,
                      memberAddress: targetAddress,
                      type: CommunityRequestType.RequestToJoin,
                      status: CommunityRequestStatus.Pending
                    })
                  })
                })

                describe('and a pending request already exists', () => {
                  beforeEach(async () => {
                    await components.communitiesDb.createCommunityRequest(
                      communityId,
                      targetAddress as EthAddress,
                      CommunityRequestType.RequestToJoin
                    )
                  })

                  it('should return 400 status code', async () => {
                    const response = await makeRequest(
                      identity,
                      `/v1/communities/${communityId}/requests`,
                      'POST',
                      requestBody
                    )
                    expect(response.status).toBe(400)
                    const body = await response.json()
                    expect(body.message).toBe('Request already exists')
                  })
                })
              })

              describe('and user is already a member', () => {
                beforeEach(async () => {
                  await components.communitiesDb.addCommunityMember({
                    communityId,
                    memberAddress: targetAddress,
                    role: CommunityRole.Member
                  })
                })

                it('should return 400 status code', async () => {
                  const response = await makeRequest(
                    identity,
                    `/v1/communities/${communityId}/requests`,
                    'POST',
                    requestBody
                  )
                  expect(response.status).toBe(400)
                  const body = await response.json()
                  expect(body.message).toContain('User cannot join since it is already a member')
                })
              })
            })

            describe('and community is public', () => {
              beforeEach(async () => {
                await components.communitiesDb.updateCommunity(communityId, {
                  private: false
                })
              })

              it('should return 400 status code', async () => {
                const response = await makeRequest(
                  identity,
                  `/v1/communities/${communityId}/requests`,
                  'POST',
                  requestBody
                )
                expect(response.status).toBe(400)
                const body = await response.json()
                expect(body.message).toBe('Public communities do not accept requests to join')
              })
            })
          })

          describe('when community does not exist', () => {
            beforeEach(async () => {
              communityId = randomUUID()
            })

            it('should return 404 status code', async () => {
              const response = await makeRequest(
                identity,
                `/v1/communities/${communityId}/requests`,
                'POST',
                requestBody
              )
              expect(response.status).toBe(404)
            })
          })
        })
      })
    })
  })
})


