import { randomUUID } from 'node:crypto'
import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { CommunityOwnerNotFoundError, CommunityPrivacyEnum, CommunityVisibilityEnum } from '../../src/logic/community'

test('Get Community Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when getting a community', () => {
    let communityId: string
    let address: string
    let identity: Identity

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()
      // Mock the comms gatekeeper to return a default voice chat status
      spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: true,
        participantCount: 2,
        moderatorCount: 1
      })
      spyComponents.catalystClient.getProfile.mockResolvedValue({
        avatars: [{ name: 'Test Owner' }]
      })
    })

    afterEach(async () => {
      if (communityId) {
        await components.communitiesDb.deleteCommunity(communityId)
      }
    })

    describe('and the request is not signed', () => {
      describe('and the community exists', () => {
        beforeEach(async () => {
          const { id } = await components.communitiesDb.createCommunity({
            name: 'Test Community',
            description: 'Test Description',
            owner_address: address,
            private: false,
            active: true,
            unlisted: false
          })
          communityId = id
        })

        it('should respond with a 400 status code', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${communityId}`)
          expect(response.status).toBe(400)
        })
      })
    })

    describe('and the request is signed', () => {
      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeRequest(identity, `/v1/communities/${nonExistentId}`)
          spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue(null)
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
            active: true,
            unlisted: false
          })
          communityId = id
        })

        describe('and the community is active', () => {
          describe('but the owner has no profile', () => {
            beforeEach(async () => {
              spyComponents.communityOwners.getOwnerName.mockRejectedValue(
                new CommunityOwnerNotFoundError(communityId, address)
              )
            })

            it('should response with a 404 status code', async () => {
              const response = await makeRequest(identity, `/v1/communities/${communityId}`)
              expect(response.status).toBe(404)
            })
          })

          describe('and the owner has a profile with a name', () => {
            beforeEach(async () => {
              spyComponents.catalystClient.getProfile.mockResolvedValue({
                avatars: [{ name: 'Test Owner' }]
              })
            })

            it('should respond with a 200 status code and the community', async () => {
              const response = await makeRequest(identity, `/v1/communities/${communityId}`)
              const body = await response.json()

              expect(response.status).toBe(200)
              expect(body).toEqual({
                data: {
                  id: communityId,
                  name: 'Test Community',
                  description: 'Test Description',
                  ownerAddress: address,
                  ownerName: 'Test Owner',
                  privacy: CommunityPrivacyEnum.Public,
                  active: true,
                  isHostingLiveEvent: false,
                  role: CommunityRole.None,
                  visibility: CommunityVisibilityEnum.All,
                  membersCount: 0,
                  voiceChatStatus: {
                    isActive: true,
                    participantCount: 2,
                    moderatorCount: 1
                  }
                }
              })
            })

            describe('and the community has no active voice chat', () => {
              beforeEach(async () => {
                spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue(null)
              })

              it('should return null for voice chat status', async () => {
                const response = await makeRequest(identity, `/v1/communities/${communityId}`)
                const body = await response.json()

                expect(response.status).toBe(200)
                expect(body.data.voiceChatStatus).toBeNull()
              })
            })

            describe('and the community is hosting live events', () => {
              beforeEach(async () => {
                spyComponents.communityEvents.isCurrentlyHostingEvents.mockResolvedValueOnce(true)
              })

              it('should respond with isHostingLiveEvent as true', async () => {
                const response = await makeRequest(identity, `/v1/communities/${communityId}`)
                const body = await response.json()

                expect(response.status).toBe(200)
                expect(body.data.isHostingLiveEvent).toBe(true)
              })
            })

            describe('and the community is not hosting live events', () => {
              beforeEach(async () => {
                spyComponents.communityEvents.isCurrentlyHostingEvents.mockResolvedValueOnce(false)
              })

              it('should respond with isHostingLiveEvent as false', async () => {
                const response = await makeRequest(identity, `/v1/communities/${communityId}`)
                const body = await response.json()

                expect(response.status).toBe(200)
                expect(body.data.isHostingLiveEvent).toBe(false)
              })
            })
          })

          describe('and the owner has a profile with an unclaimed name', () => {
            beforeEach(async () => {
              spyComponents.catalystClient.getProfile.mockResolvedValue({
                avatars: [{ unclaimedName: 'Test Owner Unclaimed' }]
              })
            })

            it('should respond with a 200 status code and the community', async () => {
              const response = await makeRequest(identity, `/v1/communities/${communityId}`)
              const body = await response.json()

              expect(response.status).toBe(200)
              expect(body).toEqual({
                data: {
                  id: communityId,
                  name: 'Test Community',
                  description: 'Test Description',
                  ownerAddress: address,
                  ownerName: 'Test Owner Unclaimed',
                  privacy: CommunityPrivacyEnum.Public,
                  visibility: CommunityVisibilityEnum.All,
                  active: true,
                  isHostingLiveEvent: false,
                  role: CommunityRole.None,
                  membersCount: 0,
                  voiceChatStatus: {
                    isActive: true,
                    participantCount: 2,
                    moderatorCount: 1
                  }
                }
              })
            })

            describe('and the community is hosting live events', () => {
              beforeEach(async () => {
                spyComponents.communityEvents.isCurrentlyHostingEvents.mockResolvedValue(true)
              })

              it('should respond with isHostingLiveEvent as true', async () => {
                const response = await makeRequest(identity, `/v1/communities/${communityId}`)
                const body = await response.json()

                expect(response.status).toBe(200)
                expect(body.data.isHostingLiveEvent).toBe(true)
              })
            })

            describe('and the community is not hosting live events', () => {
              beforeEach(async () => {
                spyComponents.communityEvents.isCurrentlyHostingEvents.mockResolvedValue(false)
              })

              it('should respond with isHostingLiveEvent as false', async () => {
                const response = await makeRequest(identity, `/v1/communities/${communityId}`)
                const body = await response.json()

                expect(response.status).toBe(200)
                expect(body.data.isHostingLiveEvent).toBe(false)
              })
            })
          })
        })

        describe('and the community is inactive', () => {
          beforeEach(async () => {
            await components.communitiesDb.deleteCommunity(communityId)
          })

          it('should respond with a 404 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}`)
            expect(response.status).toBe(404)
          })
        })
      })

      describe('and the query fails', () => {
        beforeEach(async () => {
          spyComponents.communitiesDb.getCommunity.mockRejectedValue(new Error('Unable to get community'))
        })

        it('should respond with a 500 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}`)
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
