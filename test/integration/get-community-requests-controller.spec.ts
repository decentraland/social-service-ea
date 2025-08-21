import { CommunityRequestType } from '../../src/logic/community'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'
import { createMockProfiles } from '../mocks/profile'
import { CommunityRole } from '../../src/types'

test('Get Community Requests Controller', function ({ components, spyComponents }) {
  let makeRequest: any

    describe('and the request is not signed', () => {
      let communityId: string

      beforeEach(async () => {
        makeRequest = components.localHttpFetch.fetch
        communityId = '00000000-0000-0000-0000-000000000000'
      })

      it('should return a 400 status code', async () => {
        const response = await makeRequest(`/v1/communities/${communityId}/requests`)
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      let identity: Identity
      let userAddress: string

      beforeEach(async () => {
        makeRequest = makeAuthenticatedRequest(components)
        identity = await createTestIdentity()
        userAddress = identity.realAccount.address.toLowerCase()
      })

      describe('and a community exists', () => {
        let communityId: string
        let ownerIdentity: Identity
        let ownerAddress: string

        beforeEach(async () => {
          ownerIdentity = await createTestIdentity()
          ownerAddress = ownerIdentity.realAccount.address.toLowerCase()

          // Create community with the owner
          const result = await components.communitiesDb.createCommunity(
            mockCommunity({
              name: 'Test Community',
              description: 'Test Description',
              owner_address: ownerAddress,
              private: false
            })
          )
          communityId = result.id

          // Add owner as member with Owner role
          await components.communitiesDb.addCommunityMember({
            communityId,
            memberAddress: ownerAddress,
            role: CommunityRole.Owner
          })
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [ownerAddress])
          await components.communitiesDbHelper.forceCommunityRemoval(communityId)
        })

        describe('and user fetching requests is not a member of the community', () => {
          it('should respond with a 401 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/requests`)
            expect(response.status).toBe(401)
          })
        })

        describe('and user fetching requests is a regular member', () => {
          beforeEach(async () => {
            // Add user as regular member
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: userAddress,
              role: CommunityRole.Member
            })
          })

          afterEach(async () => {
            await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [userAddress])
          })

          it('should respond with a 401 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/requests`)
            expect(response.status).toBe(401)
          })
        })

        describe('and user fetching requests is community owner', () => {
          let memberAddress1: string
          let memberAddress2: string
          let queryParameters: string

          beforeEach(async () => {
            memberAddress1 = '0x1111111111111111111111111111111111111111'
            memberAddress2 = '0x2222222222222222222222222222222222222222'
            queryParameters = '?limit=10&offset=0'

            // Mock profile responses for the requesting members
            spyComponents.catalystClient.getProfiles.mockResolvedValue(
              createMockProfiles([memberAddress1, memberAddress2])
            )
          })

          describe('and community has no requests', () => {
            it('should return 200 status code with empty results', async () => {
              const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests${queryParameters}`)
              const body = await response.json()

              expect(response.status).toBe(200)
              expect(body.data.results).toEqual([])
              expect(body.data.total).toBe(0)
              expect(body.data.page).toBe(1)
              expect(body.data.pages).toBe(0)
              expect(body.data.limit).toBe(10)
            })
          })

          describe('and community has pending requests', () => {
            beforeEach(async () => {
              // Create different types of requests
              await components.communitiesDb.createCommunityRequest(
                communityId,
                memberAddress1,
                CommunityRequestType.RequestToJoin
              )
              await components.communitiesDb.createCommunityRequest(
                communityId,
                memberAddress2,
                CommunityRequestType.Invite
              )
            })

            it('should respond with a 200 status code', async () => {
              const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests${queryParameters}`)
              expect(response.status).toBe(200)
            })

            it('should return requests with member profiles and correct structure', async () => {
              const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests${queryParameters}`)
              const body = await response.json()

              expect(body.data.results.length).toBe(2)

              const requestToJoin = body.data.results.find((r: any) => r.memberAddress === memberAddress1)
              const invite = body.data.results.find((r: any) => r.memberAddress === memberAddress2)

              expect(requestToJoin).toEqual(
                expect.objectContaining({
                  id: expect.any(String),
                  communityId,
                  memberAddress: memberAddress1,
                  type: CommunityRequestType.RequestToJoin,
                  status: 'pending',
                  name: 'Member 1',
                  hasClaimedName: false,
                  profilePictureUrl: `https://profile-images.decentraland.org/entities/${memberAddress1}/face.png`,
                  friendshipStatus: 7
                })
              )
              expect(invite).toEqual(
                expect.objectContaining({
                  id: expect.any(String),
                  communityId,
                  memberAddress: memberAddress2,
                  type: CommunityRequestType.Invite,
                  status: 'pending',
                  name: 'Member 2',
                  hasClaimedName: false,
                  profilePictureUrl: `https://profile-images.decentraland.org/entities/${memberAddress2}/face.png`,
                  friendshipStatus: 7
                })
              )
              expect(body.data.total).toBe(2)
              expect(body.data.page).toBe(1)
              expect(body.data.pages).toBe(1)
              expect(body.data.limit).toBe(10)
            })

            describe('and filtering by invite type', () => {
              beforeEach(async () => {
                queryParameters = '?type=invite'
              })

              it('should return only invite requests', async () => {
                const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests${queryParameters}`)
                const body = await response.json()

                expect(response.status).toBe(200)
                expect(body.data.results.length).toBe(1)
                expect(body.data.results[0]).toEqual(
                  expect.objectContaining({
                    id: expect.any(String),
                    communityId,
                    memberAddress: memberAddress2,
                    type: CommunityRequestType.Invite,
                    status: 'pending',
                    name: 'Member 2',
                    hasClaimedName: false,
                    profilePictureUrl: `https://profile-images.decentraland.org/entities/${memberAddress2}/face.png`,
                    friendshipStatus: 7
                  })
                )
                expect(body.data.total).toBe(1)
              })
            })

            describe('and filtering by request_to_join type', () => {
              beforeEach(async () => {
                queryParameters = '?type=request_to_join'
              })

              it('should return only request to join requests', async () => {
                const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests${queryParameters}`)
                const body = await response.json()

                expect(response.status).toBe(200)
                expect(body.data.results.length).toBe(1)
                expect(body.data.results[0]).toEqual(
                  expect.objectContaining({
                    id: expect.any(String),
                    communityId,
                    memberAddress: memberAddress1,
                    type: CommunityRequestType.RequestToJoin,
                    status: 'pending',
                    name: 'Member 1',
                    hasClaimedName: false,
                    profilePictureUrl: `https://profile-images.decentraland.org/entities/${memberAddress1}/face.png`,
                    friendshipStatus: 7
                  })
                )
                expect(body.data.total).toBe(1)
              })
            })

            describe('and filtering by invalid type', () => {
              beforeEach(async () => {
                queryParameters = '?type=invalid'
              })

              it('should return all requests ignoring invalid filter', async () => {
                const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests${queryParameters}`)
                const body = await response.json()

                expect(response.status).toBe(200)
                expect(body.data.results.length).toBe(2)
                expect(body.data.total).toBe(2)
              })
            })

            describe('and using pagination', () => {
              beforeEach(async () => {
                queryParameters = '?limit=1&offset=0'
              })

              it('should paginate results with limit and offset', async () => {
                const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests${queryParameters}`)
                const body = await response.json()

                expect(response.status).toBe(200)
                expect(body.data.results.length).toBe(1)
                expect(body.data.page).toBe(1)
                expect(body.data.pages).toBe(2)
                expect(body.data.total).toBe(2)
                expect(body.data.limit).toBe(1)
              })

              describe('and requesting second page', () => {
                beforeEach(async () => {
                  queryParameters = '?limit=1&offset=1'
                })

                it('should return the second page of results', async () => {
                  const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests${queryParameters}`)
                  const body = await response.json()

                  expect(response.status).toBe(200)
                  expect(body.data.results.length).toBe(1)
                  expect(body.data.page).toBe(2)
                  expect(body.data.pages).toBe(2)
                  expect(body.data.total).toBe(2)
                  expect(body.data.limit).toBe(1)
                })
              })
            })
          })
        })

        describe('and user fetching requests is community moderator', () => {
          let moderatorIdentity: Identity
          let moderatorAddress: string
          let memberAddress1: string

          beforeEach(async () => {
            moderatorIdentity = await createTestIdentity()
            moderatorAddress = moderatorIdentity.realAccount.address.toLowerCase()
            memberAddress1 = '0x1111111111111111111111111111111111111111'

            // Add moderator as member with Moderator role
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: moderatorAddress,
              role: CommunityRole.Moderator
            })

            // Create a request to test with
            await components.communitiesDb.createCommunityRequest(
              communityId,
              memberAddress1,
              CommunityRequestType.RequestToJoin
            )

            // Mock profile response
            spyComponents.catalystClient.getProfiles.mockResolvedValue(
              createMockProfiles([memberAddress1])
            )
          })

          afterEach(async () => {
            await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [moderatorAddress])
          })

          it('should respond with a 200 status code', async () => {
            const response = await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests`)
            expect(response.status).toBe(200)
          })

          it('should return requests data with member profiles', async () => {
            const response = await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests`)
            const body = await response.json()

            expect(body.data.results.length).toBe(1)
            expect(body.data.results[0]).toEqual(
              expect.objectContaining({
                id: expect.any(String),
                communityId,
                memberAddress: memberAddress1,
                type: CommunityRequestType.RequestToJoin,
                status: 'pending',
                name: 'Member 1',
                hasClaimedName: false,
                profilePictureUrl: `https://profile-images.decentraland.org/entities/${memberAddress1}/face.png`,
                friendshipStatus: 7
              })
            )
          })
        })
      })
    })
})
