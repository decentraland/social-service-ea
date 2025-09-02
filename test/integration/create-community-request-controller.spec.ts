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
    describe('when the request is not authenticated', () => {
      let communityId: string

      beforeEach(() => {
        communityId = randomUUID()
      })

      it('should return 400 status code', async () => {
        const { localHttpFetch } = components
        const targetAddress = '0x0000000000000000000000000000000000000002'
        
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
      let identity: Identity

      beforeEach(async () => {
        identity = await createTestIdentity()
      })

      describe('and targetedAddress is missing in body', () => {
        let communityId: string

        beforeEach(() => {
          communityId = randomUUID()
        })

        it('should return 400 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/requests`, 'POST', {
            type: CommunityRequestType.Invite
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and type is missing in body', () => {
        let communityId: string
        let targetAddress: string

        beforeEach(() => {
          communityId = randomUUID()
          targetAddress = '0x0000000000000000000000000000000000000002'
        })

        it('should return 400 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/requests`, 'POST', {
            targetedAddress: targetAddress
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and targetedAddress is not a valid EthAddress', () => {
        let communityId: string

        beforeEach(() => {
          communityId = randomUUID()
        })

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
        let communityId: string

        beforeEach(() => {
          communityId = randomUUID()
        })

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
        let communityId: string
        let targetAddress: string

        beforeEach(() => {
          communityId = randomUUID()
          targetAddress = '0x0000000000000000000000000000000000000002'
        })

        it('should return 400 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/requests`, 'POST', {
            targetedAddress: targetAddress,
            type: 'invalid-type'
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and the request body is not valid JSON', () => {
        let communityId: string

        beforeEach(() => {
          communityId = randomUUID()
        })

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

        describe('and body is empty', () => {
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
        describe('and request type is invite', () => {
          let targetAddress: string
          let requestBody: { targetedAddress: string; type: CommunityRequestType }

          beforeEach(() => {
            targetAddress = '0x0000000000000000000000000000000000000002'
            requestBody = {
              targetedAddress: targetAddress,
              type: CommunityRequestType.Invite
            }
          })

          describe('when community exists', () => {
            let communityId: string
            let ownerAddress: string

            beforeEach(async () => {
              ownerAddress = '0x0000000000000000000000000000000000000001'
              const result = await components.communitiesDb.createCommunity(
                mockCommunity({
                  name: 'Test Community',
                  description: 'Test Description',
                  owner_address: ownerAddress,
                  private: false
                })
              )
              communityId = result.id
            })

            afterEach(async () => {
              await components.communitiesDbHelper.forceCommunityRemoval(communityId)
            })

            describe('and inviter has permission to invite users', () => {
              beforeEach(async () => {
                await components.communitiesDb.addCommunityMember({
                  communityId,
                  memberAddress: identity.realAccount.address,
                  role: CommunityRole.Owner
                })
              })

              afterEach(async () => {
                await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [identity.realAccount.address])
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

                      const body = await response.json()
                      
                      // Wait for any setImmediate callbacks to complete
                      await new Promise(resolve => setImmediate(resolve))
                      
                      expect(response.status).toBe(200)
                      expect(body.data).toEqual(expect.objectContaining({
                        id: expect.any(String),
                        communityId,
                        memberAddress: targetAddress,
                        type: CommunityRequestType.Invite,
                        status: CommunityRequestStatus.Pending
                      }))
                    })
                  })

                  describe('and a pending invite already exists', () => {
                    let requestId: string

                    beforeEach(async () => {
                      const request = await components.communitiesDb.createCommunityRequest(
                        communityId,
                        targetAddress as EthAddress,
                        CommunityRequestType.Invite
                      )
                      requestId = request.id
                    })

                    afterEach(async () => {
                      await components.communitiesDbHelper.forceCommunityRequestRemoval(requestId)
                    })

                    it('should return 200 status code with the existing request', async () => {
                      const response = await makeRequest(
                        identity,
                        `/v1/communities/${communityId}/requests`,
                        'POST',
                        requestBody
                      )
                      expect(response.status).toBe(200)
                      const body = await response.json()
                      expect(body.data).toEqual(
                        expect.objectContaining({
                          id: requestId,
                          communityId,
                          memberAddress: targetAddress,
                          type: CommunityRequestType.Invite,
                          status: CommunityRequestStatus.Pending
                        })
                      )
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

                  afterEach(async () => {
                    await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [targetAddress])
                  })

                  it('should return 400 status code with correct message', async () => {
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
                      expect(body.data).toEqual(expect.objectContaining({
                        id: expect.any(String),
                        communityId,
                        memberAddress: targetAddress,
                        type: CommunityRequestType.Invite,
                        status: CommunityRequestStatus.Pending
                      }))
                    })
                  })

                  describe('and a pending invite already exists', () => {
                    let requestId: string

                    beforeEach(async () => {
                      const request = await components.communitiesDb.createCommunityRequest(
                        communityId,
                        targetAddress as EthAddress,
                        CommunityRequestType.Invite
                      )
                      requestId = request.id
                    })

                    afterEach(async () => {
                      await components.communitiesDbHelper.forceCommunityRequestRemoval(requestId)
                    })

                    it('should return 200 status code with the existing request', async () => {
                      const response = await makeRequest(
                        identity,
                        `/v1/communities/${communityId}/requests`,
                        'POST',
                        requestBody
                      )
                      expect(response.status).toBe(200)
                      const body = await response.json()
                      expect(body.data).toEqual(
                        expect.objectContaining({
                          id: requestId,
                          communityId,
                          memberAddress: targetAddress,
                          type: CommunityRequestType.Invite,
                          status: CommunityRequestStatus.Pending
                        })
                      )
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

                  afterEach(async () => {
                    await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [targetAddress])
                  })

                  it('should return 400 status code with correct message', async () => {
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

            describe('and inviter does not have permission to invite users', () => {
              beforeEach(async () => {
                await components.communitiesDb.addCommunityMember({
                  communityId,
                  memberAddress: ownerAddress,
                  role: CommunityRole.Member
                })
              })

              afterEach(async () => {
                await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [ownerAddress])
              })

              it('should return 401 status code', async () => {
                const response = await makeRequest(
                  identity,
                  `/v1/communities/${communityId}/requests`,
                  'POST',
                  requestBody
                )
                expect(response.status).toBe(401)
              })
            })
          })

          describe('when community does not exist', () => {
            let nonExistentId: string

            beforeEach(() => {
              nonExistentId = randomUUID()
            })

            it('should return 404 status code', async () => {
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
          let requestBody: { targetedAddress: string; type: CommunityRequestType }

          beforeEach(() => {
            requestBody = {
              targetedAddress: identity.realAccount.address,
              type: CommunityRequestType.RequestToJoin
            }
          })

          describe('when community exists', () => {
            let communityId: string
            let ownerAddress: string

            beforeEach(async () => {
              ownerAddress = '0x0000000000000000000000000000000000000001'
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

            afterEach(async () => {
              await components.communitiesDbHelper.forceCommunityRemoval(communityId)
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
                    expect(body.data).toEqual(expect.objectContaining({
                      id: expect.any(String),
                      communityId,
                      type: CommunityRequestType.RequestToJoin,
                      status: CommunityRequestStatus.Pending
                    }))
                    expect(body.data.memberAddress.toLowerCase()).toBe(identity.realAccount.address.toLowerCase())
                  })
                })

                describe('and a pending request_to_join already exists', () => {
                  let requestId: string

                  beforeEach(async () => {
                    const request = await components.communitiesDb.createCommunityRequest(
                      communityId,
                      identity.realAccount.address as EthAddress,
                      CommunityRequestType.RequestToJoin
                    )
                    requestId = request.id
                  })

                  afterEach(async () => {
                    await components.communitiesDbHelper.forceCommunityRequestRemoval(requestId)
                  })

                  it('should return 200 status code with the existing request', async () => {
                    const response = await makeRequest(
                      identity,
                      `/v1/communities/${communityId}/requests`,
                      'POST',
                      { ...requestBody, targetedAddress: identity.realAccount.address }
                    )
                    expect(response.status).toBe(200)
                    const body = await response.json()
                    expect(body.data).toEqual(
                      expect.objectContaining({
                        id: requestId,
                        communityId,
                        memberAddress: identity.realAccount.address.toLowerCase(),
                        type: CommunityRequestType.RequestToJoin,
                        status: CommunityRequestStatus.Pending
                      })
                    )
                  })
                })

                describe('and a pending invite already exists', () => {
                  let requestId: string

                  beforeEach(async () => {
                    const request = await components.communitiesDb.createCommunityRequest(
                      communityId,
                      identity.realAccount.address as EthAddress,
                      CommunityRequestType.Invite
                    )
                    requestId = request.id
                  })

                  afterEach(async () => {
                    await components.communitiesDbHelper.forceCommunityRequestRemoval(requestId)
                  })

                  it('should return 200 status code', async () => {
                    const response = await makeRequest(
                      identity,
                      `/v1/communities/${communityId}/requests`,
                      'POST',
                      requestBody
                    )
                    expect(response.status).toBe(200)
                  })

                  it('should return the request as already accepted', async () => {
                    const response = await makeRequest(
                      identity,
                      `/v1/communities/${communityId}/requests`,
                      'POST',
                      requestBody
                    )
                    const body = await response.json()
                    expect(body.data).toEqual(expect.objectContaining({
                      id: expect.any(String),
                      communityId,
                      type: CommunityRequestType.RequestToJoin,
                      status: CommunityRequestStatus.Accepted
                    }))
                    expect(body.data.memberAddress.toLowerCase()).toBe(identity.realAccount.address.toLowerCase())
                  })

                  it('should automatically join the user to the community', async () => {
                    await makeRequest(
                      identity,
                      `/v1/communities/${communityId}/requests`,
                      'POST',
                      requestBody
                    )
                    
                    const memberRole = await components.communitiesDb.getCommunityMemberRole(communityId, identity.realAccount.address)
                    expect(memberRole).toBe(CommunityRole.Member)
                  })
                })
              })

              describe('and user is already a member', () => {
                beforeEach(async () => {
                  await components.communitiesDb.addCommunityMember({
                    communityId,
                    memberAddress: identity.realAccount.address,
                    role: CommunityRole.Member
                  })
                })

                afterEach(async () => {
                  await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [identity.realAccount.address])
                })

                it('should return 400 status code with correct message', async () => {
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

              it('should return 400 status code with correct message', async () => {
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
            let communityId: string

            beforeEach(() => {
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