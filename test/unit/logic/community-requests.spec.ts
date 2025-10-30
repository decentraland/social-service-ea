import { randomUUID } from 'crypto'
import {
  Community,
  CommunityNotFoundError,
  CommunityRequestNotFoundError,
  CommunityPrivacyEnum,
  CommunityRequestStatus,
  CommunityRequestType,
  GetCommunityRequestsOptions,
  ICommunitiesComponent,
  ICommunityRequestsComponent,
  ICommunityRolesComponent,
  InvalidCommunityRequestError,
  ListCommunityRequestsOptions,
  MemberRequest,
  ICommunityBroadcasterComponent,
  ICommunityThumbnailComponent,
  CommunityDB
} from '../../../src/logic/community'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { createCommunityRequestsComponent } from '../../../src/logic/community/requests'
import { createMockedPubSubComponent, mockLogs } from '../../mocks/components'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { CommunityRole, IPubSubComponent } from '../../../src/types'
import { ICatalystClientComponent } from '../../../src/types'
import { createMockCatalystClient } from '../../mocks/components/catalyst-client'
import {
  createMockCommunitiesComponent,
  createMockCommunityBroadcasterComponent,
  createMockCommunityRolesComponent,
  createMockCommunityThumbnailComponent,
  mockCommunity
} from '../../mocks/communities'
import {
  CommunityInviteReceivedEvent,
  CommunityRequestToJoinAcceptedEvent,
  CommunityRequestToJoinReceivedEvent,
  Events
} from '@dcl/schemas'
import { COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createMockedAnalyticsComponent } from '../../mocks/components/analytics'

describe('Community Requests Component', () => {
  let communityRequestsComponent: ICommunityRequestsComponent
  let communitiesComponent: ICommunitiesComponent
  let mockCommunityBroadcaster: ICommunityBroadcasterComponent
  let mockCommunityThumbnail: ICommunityThumbnailComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
  let mockCatalystClient: jest.Mocked<ICatalystClientComponent>
  let mockPubsub: jest.Mocked<IPubSubComponent>
  let mockAnalytics: ReturnType<typeof createMockedAnalyticsComponent>

  beforeEach(() => {
    communitiesComponent = createMockCommunitiesComponent({})
    mockCommunityRoles = createMockCommunityRolesComponent({})
    mockCatalystClient = createMockCatalystClient()
    mockAnalytics = createMockedAnalyticsComponent({})
    // Ensure logs.getLogger returns a valid logger after mock resets
    mockLogs.getLogger.mockReturnValue({
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn()
    })
    mockCommunityBroadcaster = createMockCommunityBroadcasterComponent({})
    mockCommunityThumbnail = createMockCommunityThumbnailComponent({})
    mockPubsub = createMockedPubSubComponent({})
    communityRequestsComponent = createCommunityRequestsComponent({
      communitiesDb: mockCommunitiesDB,
      communities: communitiesComponent,
      communityRoles: mockCommunityRoles,
      communityBroadcaster: mockCommunityBroadcaster,
      communityThumbnail: mockCommunityThumbnail,
      catalystClient: mockCatalystClient,
      pubsub: mockPubsub,
      logs: mockLogs,
      analytics: mockAnalytics
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
    // Clean up any registries or persistent state
  })

  describe('when creating a community request', () => {
    describe('when community does not exist', () => {
      let communityId: string
      let userAddress: string
      let callerAddress: string
      let type: CommunityRequestType

      beforeEach(() => {
        communityId = randomUUID()
        userAddress = '0x1234567890123456789012345678901234567890'
        callerAddress = '0x1234567890123456789012345678901234567891'
        type = CommunityRequestType.RequestToJoin
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(null)
      })

      it('should throw a CommunityNotFoundError', async () => {
        await expect(
          communityRequestsComponent.createCommunityRequest(communityId, userAddress, type, callerAddress)
        ).rejects.toThrow(CommunityNotFoundError)
      })
    })

    describe('when community exists and is public', () => {
      let community: Community & { role: CommunityRole }
      let userAddress: string
      let callerAddress: string

      beforeEach(() => {
        userAddress = '0x1234567890123456789012345678901234567890'
        callerAddress = '0x1234567890123456789012345678901234567891'
        community = {
          id: randomUUID(),
          name: 'Mock Community',
          description: 'Mock Description',
          ownerAddress: userAddress,
          privacy: CommunityPrivacyEnum.Public,
          active: true,
          role: CommunityRole.None
        }
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(community)
      })

      describe('and request type is RequestToJoin', () => {
        let type: CommunityRequestType

        beforeEach(() => {
          type = CommunityRequestType.RequestToJoin
          callerAddress = userAddress
        })

        it('should throw an InvalidCommunityRequestError with correct message', async () => {
          await expect(
            communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
          ).rejects.toThrow('Public communities do not accept requests to join')
        })

        it('should throw an InvalidCommunityRequestError', async () => {
          await expect(
            communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
          ).rejects.toThrow(InvalidCommunityRequestError)
        })
      })

      describe('and request type is Invite', () => {
        let type: CommunityRequestType
        let expectedCreatedRequest: MemberRequest

        beforeEach(() => {
          type = CommunityRequestType.Invite
          expectedCreatedRequest = {
            id: randomUUID(),
            communityId: community.id,
            memberAddress: userAddress,
            type,
            status: CommunityRequestStatus.Pending
          }
          mockCommunitiesDB.createCommunityRequest.mockImplementationOnce(() => {
            return Promise.resolve(expectedCreatedRequest)
          })
        })

        describe('and inviter does not have permission to invite users', () => {
          beforeEach(() => {
            mockCommunityRoles.validatePermissionToInviteUsers.mockRejectedValueOnce(
              new NotAuthorizedError('User does not have permission')
            )
          })

          it('should throw an NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
            ).rejects.toThrow(NotAuthorizedError)
          })

          it('should not broadcast the request to join received event', async () => {
            try {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
            } catch (error) {
              // Expected to throw, but still check broadcast wasn't called
            }
            // Wait for any potential async operations
            await new Promise((resolve) => setImmediate(resolve))
            expect(mockCommunityBroadcaster.broadcast).not.toHaveBeenCalled()
          })
        })

        describe('and inviter has permission to invite users', () => {
          beforeEach(() => {
            mockCommunityRoles.validatePermissionToInviteUsers.mockResolvedValueOnce()
          })

          describe('and user does not belong to community', () => {
            beforeEach(() => {
              community.role = CommunityRole.None
            })

            describe('and there are no pending requests for the user', () => {
              beforeEach(() => {
                mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([])
              })

              it('should create and return the request as pending', async () => {
                const result = await communityRequestsComponent.createCommunityRequest(
                  community.id,
                  userAddress,
                  type,
                  callerAddress
                )
                expect(result).toEqual({
                  id: expect.any(String),
                  communityId: community.id,
                  memberAddress: userAddress,
                  type,
                  status: CommunityRequestStatus.Pending
                })
                expect(mockCommunitiesDB.createCommunityRequest).toHaveBeenCalledWith(community.id, userAddress, type)
              })

              it('should broadcast the invite received event', async () => {
                await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
                // Wait for async broadcast
                await new Promise((resolve) => setImmediate(resolve))
                expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
                  type: Events.Type.COMMUNITY,
                  subType: Events.SubType.Community.INVITE_RECEIVED,
                  key: expect.any(String),
                  timestamp: expect.any(Number),
                  metadata: {
                    communityId: community.id,
                    communityName: community.name,
                    memberAddress: userAddress,
                    thumbnailUrl: mockCommunityThumbnail.buildThumbnailUrl(community.id)
                  }
                } as CommunityInviteReceivedEvent)
              })
            })

            describe('and there is a pending request_to_join for the user', () => {
              let requestToJoinRequest: MemberRequest

              beforeEach(() => {
                requestToJoinRequest = { ...expectedCreatedRequest, type: CommunityRequestType.RequestToJoin }
                mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([requestToJoinRequest])
                callerAddress = userAddress
                mockCommunityRoles.validatePermissionToInviteUsers.mockResolvedValueOnce()
              })

              it('should automatically join the user to the community', async () => {
                await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
                expect(mockCommunitiesDB.joinMemberAndRemoveRequests).toHaveBeenCalledWith({
                  communityId: community.id,
                  memberAddress: userAddress,
                  role: CommunityRole.Member
                })
              })

              it('should return the request as accepted with invite type', async () => {
                const result = await communityRequestsComponent.createCommunityRequest(
                  community.id,
                  userAddress,
                  type,
                  callerAddress
                )
                expect(result).toEqual({
                  ...requestToJoinRequest,
                  type: CommunityRequestType.Invite,
                  status: CommunityRequestStatus.Accepted
                })
              })

              it('should notify member join through pubsub', async () => {
                await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
                expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
                  communityId: community.id,
                  memberAddress: userAddress,
                  status: ConnectivityStatus.ONLINE
                })
              })

              it('should not create the invite request', async () => {
                await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
                expect(mockCommunitiesDB.createCommunityRequest).not.toHaveBeenCalled()
              })
            })
          })

          describe('and user already belongs to community', () => {
            beforeEach(() => {
              community.role = CommunityRole.Member
            })

            it('should throw an InvalidCommunityRequestError with correct message', async () => {
              await expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              ).rejects.toThrow(`User cannot join since it is already a member of the community: ${community.name}`)
            })

            it('should throw an InvalidCommunityRequestError', async () => {
              await expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              ).rejects.toThrow(InvalidCommunityRequestError)
            })
          })
        })
      })
    })

    describe('when community exists and is private', () => {
      let community: Community & { role: CommunityRole }
      let userAddress: string
      let callerAddress: string

      beforeEach(() => {
        userAddress = '0x1234567890123456789012345678901234567890'
        callerAddress = '0x1234567890123456789012345678901234567891'
        community = {
          id: randomUUID(),
          name: 'Mock Community',
          description: 'Mock Description',
          ownerAddress: userAddress,
          privacy: CommunityPrivacyEnum.Private,
          active: true,
          role: CommunityRole.None
        }
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(community)
      })

      describe('and request type is RequestToJoin', () => {
        let type: CommunityRequestType
        let expectedCreatedRequest: MemberRequest

        beforeEach(() => {
          type = CommunityRequestType.RequestToJoin
          callerAddress = userAddress
          expectedCreatedRequest = {
            id: randomUUID(),
            communityId: community.id,
            memberAddress: userAddress,
            type,
            status: CommunityRequestStatus.Pending
          }
          mockCommunitiesDB.createCommunityRequest.mockImplementationOnce(() => {
            return Promise.resolve(expectedCreatedRequest)
          })
        })

        describe('and user does not belong to community', () => {
          beforeEach(() => {
            community.role = CommunityRole.None
          })

          describe('and there are no pending requests for the user', () => {
            let mockProfile: any

            beforeEach(() => {
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([])
              mockProfile = {
                avatars: [
                  {
                    name: 'TestUser',
                    unclaimedName: 'test_user',
                    userId: userAddress,
                    hasClaimedName: true
                  }
                ]
              }
              mockCatalystClient.getProfile.mockResolvedValueOnce(mockProfile)
            })

            it('should create and return the request as pending', async () => {
              const result = await communityRequestsComponent.createCommunityRequest(
                community.id,
                userAddress,
                type,
                callerAddress
              )
              expect(result).toEqual({
                id: expect.any(String),
                communityId: community.id,
                memberAddress: userAddress,
                type,
                status: CommunityRequestStatus.Pending
              })
              expect(mockCommunitiesDB.createCommunityRequest).toHaveBeenCalledWith(community.id, userAddress, type)
            })

            it('should not publish the community member status updates', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockPubsub.publishInChannel).not.toHaveBeenCalled()
            })

            it('should broadcast the request to join received event', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              // Wait for async broadcast
              await new Promise((resolve) => setImmediate(resolve))
              expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
                type: Events.Type.COMMUNITY,
                subType: Events.SubType.Community.REQUEST_TO_JOIN_RECEIVED,
                key: expect.any(String),
                timestamp: expect.any(Number),
                metadata: {
                  communityId: community.id,
                  communityName: community.name,
                  memberAddress: userAddress,
                  memberName: 'TestUser',
                  thumbnailUrl: mockCommunityThumbnail.buildThumbnailUrl(community.id)
                }
              } as CommunityRequestToJoinReceivedEvent)
            })

            it('should fetch member profile for request to join', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              // Wait for async broadcast
              await new Promise((resolve) => setImmediate(resolve))
              expect(mockCatalystClient.getProfile).toHaveBeenCalledWith(userAddress)
            })
          })

          describe('and profile fetch fails', () => {
            beforeEach(() => {
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([])
              mockCatalystClient.getProfile.mockRejectedValueOnce(new Error('Profile not found'))
            })

            it('should still broadcast the request to join received event with Unknown as member name', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              // Wait for async broadcast
              await new Promise((resolve) => setImmediate(resolve))
              expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
                type: Events.Type.COMMUNITY,
                subType: Events.SubType.Community.REQUEST_TO_JOIN_RECEIVED,
                key: expect.any(String),
                timestamp: expect.any(Number),
                metadata: {
                  communityId: community.id,
                  communityName: community.name,
                  memberName: 'Unknown',
                  memberAddress: userAddress,
                  thumbnailUrl: mockCommunityThumbnail.buildThumbnailUrl(community.id)
                }
              } as CommunityRequestToJoinReceivedEvent)
            })
          })

          describe('and the caller is different from the user', () => {
            beforeEach(() => {
              callerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabce'
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([])
            })

            it('should throw an InvalidCommunityRequestError with correct message', async () => {
              await expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              ).rejects.toThrow('User trying to impersonate another user')
            })

            it('should throw an InvalidCommunityRequestError', async () => {
              await expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              ).rejects.toThrow(InvalidCommunityRequestError)
            })
          })

          describe('and there is a pending request_to_join for the user', () => {
            let duplicatedRequest: MemberRequest

            beforeEach(() => {
              duplicatedRequest = { ...expectedCreatedRequest, type: CommunityRequestType.RequestToJoin }
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([duplicatedRequest])
              callerAddress = userAddress
            })

            it('should return the existing request', async () => {
              const result = await communityRequestsComponent.createCommunityRequest(
                community.id,
                userAddress,
                type,
                callerAddress
              )
              expect(result).toEqual(duplicatedRequest)
            })

            it('should not create a new request', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockCommunitiesDB.createCommunityRequest).not.toHaveBeenCalled()
            })

            it('should not accept any request', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })

            it('should not broadcast the request to join received event', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockCommunityBroadcaster.broadcast).not.toHaveBeenCalled()
            })
          })

          describe('and there is a pending invite for the user', () => {
            beforeEach(() => {
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([
                {
                  ...expectedCreatedRequest,
                  type: CommunityRequestType.Invite
                }
              ])
              callerAddress = userAddress
            })

            it('should automatically join the user to the community', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).toHaveBeenCalledWith({
                communityId: community.id,
                memberAddress: userAddress,
                role: CommunityRole.Member
              })
            })

            it('should notify member join through pubsub', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
                communityId: community.id,
                memberAddress: userAddress,
                status: ConnectivityStatus.ONLINE
              })
            })

            it('should return the request as accepted', async () => {
              const result = await communityRequestsComponent.createCommunityRequest(
                community.id,
                userAddress,
                type,
                callerAddress
              )
              expect(result).toEqual({
                id: expect.any(String),
                communityId: community.id,
                memberAddress: userAddress,
                type: CommunityRequestType.RequestToJoin,
                status: CommunityRequestStatus.Accepted
              })
            })

            it('should not create the request to join', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockCommunitiesDB.createCommunityRequest).not.toHaveBeenCalled()
            })
          })
        })

        describe('and user already belongs to community', () => {
          beforeEach(() => {
            community.role = CommunityRole.Member
          })

          it('should throw an InvalidCommunityRequestError with correct message', async () => {
            await expect(
              communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
            ).rejects.toThrow(`User cannot join since it is already a member of the community: ${community.name}`)
          })

          it('should throw an InvalidCommunityRequestError', async () => {
            await expect(
              communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
            ).rejects.toThrow(InvalidCommunityRequestError)
          })
        })
      })

      describe('and request type is Invite', () => {
        let type: CommunityRequestType
        let expectedCreatedRequest: MemberRequest

        beforeEach(() => {
          type = CommunityRequestType.Invite
          expectedCreatedRequest = {
            id: randomUUID(),
            communityId: community.id,
            memberAddress: userAddress,
            type,
            status: CommunityRequestStatus.Pending
          }
          mockCommunitiesDB.createCommunityRequest.mockImplementationOnce(() => {
            return Promise.resolve(expectedCreatedRequest)
          })
        })

        describe('and inviter does not have permission to invite users', () => {
          beforeEach(() => {
            mockCommunityRoles.validatePermissionToInviteUsers.mockRejectedValueOnce(
              new NotAuthorizedError('User does not have permission')
            )
          })

          it('should throw an NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
            ).rejects.toThrow(NotAuthorizedError)
          })
        })

        describe('and user does not belong to community', () => {
          beforeEach(() => {
            community.role = CommunityRole.None
          })

          describe('and there are no pending requests for the user', () => {
            beforeEach(() => {
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([])
              mockCommunityRoles.validatePermissionToInviteUsers.mockResolvedValueOnce()
            })

            it('should create and return the request as pending', async () => {
              const result = await communityRequestsComponent.createCommunityRequest(
                community.id,
                userAddress,
                type,
                callerAddress
              )
              expect(result).toEqual({
                id: expect.any(String),
                communityId: community.id,
                memberAddress: userAddress,
                type,
                status: CommunityRequestStatus.Pending
              })
              expect(mockCommunitiesDB.createCommunityRequest).toHaveBeenCalledWith(community.id, userAddress, type)
            })

            it('should broadcast the invite received event', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              // Wait for async broadcast
              await new Promise((resolve) => setImmediate(resolve))
              expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
                type: Events.Type.COMMUNITY,
                subType: Events.SubType.Community.INVITE_RECEIVED,
                key: expect.any(String),
                timestamp: expect.any(Number),
                metadata: {
                  communityId: community.id,
                  communityName: community.name,
                  memberAddress: userAddress,
                  thumbnailUrl: mockCommunityThumbnail.buildThumbnailUrl(community.id)
                }
              } as CommunityInviteReceivedEvent)
            })

            it('should not fetch member profile for invites', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              // Wait for async broadcast
              await new Promise((resolve) => setImmediate(resolve))
              expect(mockCatalystClient.getProfile).not.toHaveBeenCalled()
            })

            it('should not include member name in invite received event', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              // Wait for async broadcast
              await new Promise((resolve) => setImmediate(resolve))
              const broadcastCall = (mockCommunityBroadcaster.broadcast as jest.Mock).mock.calls[0][0]
              expect(broadcastCall.metadata).not.toHaveProperty('memberName')
            })
          })

          describe('and there is a pending invite for the user', () => {
            let duplicatedRequest: MemberRequest

            beforeEach(() => {
              duplicatedRequest = { ...expectedCreatedRequest, type: CommunityRequestType.Invite }
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([duplicatedRequest])
              mockCommunityRoles.validatePermissionToInviteUsers.mockResolvedValueOnce()
            })

            it('should return the existing request', async () => {
              const result = await communityRequestsComponent.createCommunityRequest(
                community.id,
                userAddress,
                type,
                callerAddress
              )
              expect(result).toEqual(duplicatedRequest)
            })

            it('should not create a new request', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockCommunitiesDB.createCommunityRequest).not.toHaveBeenCalled()
            })

            it('should not accept any request', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })

            it('should not broadcast the invite received event', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockCommunityBroadcaster.broadcast).not.toHaveBeenCalled()
            })

            it('should not publish the community member status updates', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockPubsub.publishInChannel).not.toHaveBeenCalled()
            })
          })

          describe('and there is a pending request_to_join for the user', () => {
            let requestToJoinRequest: MemberRequest

            beforeEach(() => {
              requestToJoinRequest = { ...expectedCreatedRequest, type: CommunityRequestType.RequestToJoin }
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([requestToJoinRequest])
              mockCommunityRoles.validatePermissionToInviteUsers.mockResolvedValueOnce()
            })

            it('should automatically join the user to the community', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).toHaveBeenCalledWith({
                communityId: community.id,
                memberAddress: userAddress,
                role: CommunityRole.Member
              })
            })

            it('should return the request as accepted with invite type', async () => {
              const result = await communityRequestsComponent.createCommunityRequest(
                community.id,
                userAddress,
                type,
                callerAddress
              )
              expect(result).toEqual({
                ...requestToJoinRequest,
                type: CommunityRequestType.Invite,
                status: CommunityRequestStatus.Accepted
              })
            })

            it('should notify member join through pubsub', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
                communityId: community.id,
                memberAddress: userAddress,
                status: ConnectivityStatus.ONLINE
              })
            })

            it('should not create the invite request', async () => {
              await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
              expect(mockCommunitiesDB.createCommunityRequest).not.toHaveBeenCalled()
            })
          })
        })

        describe('and user already belongs to community', () => {
          beforeEach(() => {
            community.role = CommunityRole.Member
            mockCommunityRoles.validatePermissionToInviteUsers.mockResolvedValueOnce()
          })

          it('should throw an InvalidCommunityRequestError with correct message', async () => {
            await expect(
              communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
            ).rejects.toThrow(`User cannot join since it is already a member of the community: ${community.name}`)
          })

          it('should throw an InvalidCommunityRequestError', async () => {
            await expect(
              communityRequestsComponent.createCommunityRequest(community.id, userAddress, type, callerAddress)
            ).rejects.toThrow(InvalidCommunityRequestError)
          })
        })
      })
    })
  })

  describe('when getting member requests', () => {
    let memberAddress: string
    let pagination: { limit: number; offset: number }

    beforeEach(() => {
      memberAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      pagination = { limit: 10, offset: 0 }
      mockCommunitiesDB.getCommunityRequests.mockReset()
      mockCommunitiesDB.getCommunityRequestsCount.mockReset()
    })

    describe('and no type filter is provided', () => {
      let requests: MemberRequest[]
      let options: ListCommunityRequestsOptions

      beforeEach(() => {
        requests = [
          {
            id: randomUUID(),
            communityId: randomUUID(),
            memberAddress,
            type: CommunityRequestType.Invite,
            status: CommunityRequestStatus.Pending
          },
          {
            id: randomUUID(),
            communityId: randomUUID(),
            memberAddress,
            type: CommunityRequestType.RequestToJoin,
            status: CommunityRequestStatus.Pending
          }
        ]
        mockCommunitiesDB.getMemberRequests.mockResolvedValueOnce(requests)
        mockCommunitiesDB.getMemberRequestsCount.mockResolvedValueOnce(2)
        options = {
          pagination,
          type: undefined
        }
      })

      it('should return pending requests (invites and requests) with total, forwarding pagination and filters', async () => {
        const result = await communityRequestsComponent.getMemberRequests(memberAddress, options)

        expect(result).toEqual({ requests, total: requests.length })
        expect(mockCommunitiesDB.getMemberRequests).toHaveBeenCalledWith(memberAddress, {
          pagination: options.pagination,
          status: CommunityRequestStatus.Pending,
          type: options.type
        })
        expect(mockCommunitiesDB.getMemberRequestsCount).toHaveBeenCalledWith(memberAddress, {
          status: CommunityRequestStatus.Pending,
          type: options.type
        })
      })
    })

    describe('and filtering by type invite', () => {
      let filteredRequests: MemberRequest[]
      let options: ListCommunityRequestsOptions

      beforeEach(() => {
        filteredRequests = [
          {
            id: randomUUID(),
            communityId: randomUUID(),
            memberAddress,
            type: CommunityRequestType.Invite,
            status: CommunityRequestStatus.Pending
          }
        ]
        mockCommunitiesDB.getMemberRequests.mockResolvedValueOnce(filteredRequests)
        mockCommunitiesDB.getMemberRequestsCount.mockResolvedValueOnce(1)
        options = {
          pagination,
          type: CommunityRequestType.Invite
        }
      })

      it('should forward the invite type filter', async () => {
        const result = await communityRequestsComponent.getMemberRequests(memberAddress, options)

        expect(result).toEqual({ requests: filteredRequests, total: 1 })
        expect(mockCommunitiesDB.getMemberRequests).toHaveBeenCalledWith(memberAddress, {
          pagination: options.pagination,
          status: CommunityRequestStatus.Pending,
          type: options.type
        })
        expect(mockCommunitiesDB.getMemberRequestsCount).toHaveBeenCalledWith(memberAddress, {
          status: CommunityRequestStatus.Pending,
          type: options.type
        })
      })
    })

    describe('and filtering by type request_to_join', () => {
      let filteredRequests: MemberRequest[]
      let options: ListCommunityRequestsOptions

      beforeEach(() => {
        filteredRequests = [
          {
            id: randomUUID(),
            communityId: randomUUID(),
            memberAddress,
            type: CommunityRequestType.RequestToJoin,
            status: CommunityRequestStatus.Pending
          }
        ]
        mockCommunitiesDB.getMemberRequests.mockResolvedValueOnce(filteredRequests)
        mockCommunitiesDB.getMemberRequestsCount.mockResolvedValueOnce(1)
        options = {
          pagination,
          type: CommunityRequestType.RequestToJoin
        }
      })

      it('should forward the request_to_join type filter', async () => {
        const result = await communityRequestsComponent.getMemberRequests(memberAddress, options)

        expect(result).toEqual({ requests: filteredRequests, total: filteredRequests.length })
        expect(mockCommunitiesDB.getMemberRequests).toHaveBeenCalledWith(memberAddress, {
          pagination: options.pagination,
          status: CommunityRequestStatus.Pending,
          type: options.type
        })
        expect(mockCommunitiesDB.getMemberRequestsCount).toHaveBeenCalledWith(memberAddress, {
          status: CommunityRequestStatus.Pending,
          type: options.type
        })
      })
    })

    describe('and there are no requests stored in the database', () => {
      let options: ListCommunityRequestsOptions

      beforeEach(() => {
        mockCommunitiesDB.getMemberRequests.mockResolvedValueOnce([])
        mockCommunitiesDB.getMemberRequestsCount.mockResolvedValueOnce(0)
        options = {
          pagination
        }
      })

      it('should return empty results and zero total', async () => {
        const result = await communityRequestsComponent.getMemberRequests(memberAddress, options)

        expect(result).toEqual({ requests: [], total: 0 })
      })
    })
  })

  describe('when updating request status', () => {
    let requestId: string
    let callerAddress: string

    beforeEach(() => {
      requestId = randomUUID()
      callerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    })

    describe('and the community involved exists', () => {
      let community: Community & { role: CommunityRole }

      beforeEach(() => {
        community = {
          active: true,
          description: 'Mock Description',
          name: 'Mock Community',
          ownerAddress: '0x123',
          privacy: CommunityPrivacyEnum.Public,
          id: randomUUID(),
          role: CommunityRole.None
        }
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(community)
      })

      describe('and the request does not exist', () => {
        let status: Exclude<CommunityRequestStatus, 'pending'>

        beforeEach(() => {
          mockCommunitiesDB.getCommunityRequest.mockResolvedValueOnce(null)
          status = CommunityRequestStatus.Accepted
        })

        it('should throw CommunityRequestNotFoundError', async () => {
          await expect(
            communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
          ).rejects.toThrow(CommunityRequestNotFoundError)
        })
      })

      describe('and the request exists but is not pending', () => {
        let status: Exclude<CommunityRequestStatus, 'pending'>
        let userAddress: string
        let nonPendingRequest: MemberRequest

        beforeEach(() => {
          userAddress = '0x1234567890123456789012345678901234567890'
          status = CommunityRequestStatus.Rejected
          nonPendingRequest = {
            id: requestId,
            communityId: community.id, // Use the same community ID from parent scope
            memberAddress: userAddress,
            type: CommunityRequestType.Invite,
            status: CommunityRequestStatus.Accepted
          }
          mockCommunitiesDB.getCommunityRequest.mockResolvedValueOnce(nonPendingRequest)
        })

        it('should throw CommunityRequestNotFoundError', async () => {
          await expect(
            communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
          ).rejects.toThrow(CommunityRequestNotFoundError)
        })
      })

      describe('and the invite request exists', () => {
        let inviteRequest: MemberRequest
        let invitedUserAddress: string

        beforeEach(() => {
          invitedUserAddress = '0x1111111111111111111111111111111111111111'
          inviteRequest = {
            id: requestId,
            communityId: community.id, // Use the same community ID from parent scope
            memberAddress: invitedUserAddress,
            type: CommunityRequestType.Invite,
            status: CommunityRequestStatus.Pending
          }
          mockCommunitiesDB.getCommunityRequest.mockResolvedValueOnce(inviteRequest)
        })

        describe('and the caller is the invited user', () => {
          beforeEach(() => {
            callerAddress = invitedUserAddress
          })

          describe('and the status is accepted', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Accepted
              mockCommunitiesDB.joinMemberAndRemoveRequests.mockResolvedValueOnce(undefined)
            })

            it('should use transaction to add member and remove request', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).toHaveBeenCalledWith({
                communityId: inviteRequest.communityId,
                memberAddress: invitedUserAddress,
                role: CommunityRole.Member
              })
              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).not.toHaveBeenCalled()
            })

            it('should notify member join through pubsub', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

              expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
                communityId: inviteRequest.communityId,
                memberAddress: invitedUserAddress,
                status: ConnectivityStatus.ONLINE
              })
            })
          })

          describe('and the status is rejected', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Rejected
              mockCommunitiesDB.removeCommunityRequest.mockResolvedValueOnce()
            })

            it('should remove the request', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

              expect(mockCommunitiesDB.removeCommunityRequest).toHaveBeenCalledWith(requestId)
              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
              expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).not.toHaveBeenCalled()
            })

            it('should not publish the community member status updates', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              expect(mockPubsub.publishInChannel).not.toHaveBeenCalled()
            })
          })

          describe('and the status is cancelled', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Cancelled
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })
        })

        describe('and the caller has community privileges', () => {
          beforeEach(() => {
            callerAddress = '0x2222222222222222222222222222222222222222' // Different from invited user
            mockCommunityRoles.validatePermissionToAcceptAndRejectRequests.mockResolvedValueOnce()
          })

          describe('and the status is accepted', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Accepted
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })

          describe('and the status is rejected', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Rejected
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })

          describe('and the status is cancelled', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Cancelled
              mockCommunitiesDB.removeCommunityRequest.mockResolvedValueOnce()
            })

            it('should remove the request', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

              expect(mockCommunitiesDB.removeCommunityRequest).toHaveBeenCalledWith(requestId)
              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
              expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).toHaveBeenCalledWith(
                inviteRequest.communityId,
                callerAddress
              )
            })

            it('should not publish the community member status updates', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              expect(mockPubsub.publishInChannel).not.toHaveBeenCalled()
            })
          })
        })

        describe('and the caller is neither the invited user nor has privileges', () => {
          beforeEach(() => {
            callerAddress = '0x3333333333333333333333333333333333333333' // Different from invited user
            mockCommunityRoles.validatePermissionToAcceptAndRejectRequests.mockRejectedValueOnce(
              new NotAuthorizedError('User does not have permission')
            )
          })

          describe('and the status is accepted', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Accepted
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })

          describe('and the status is rejected', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Rejected
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })

          describe('and the status is cancelled', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Cancelled
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })
        })
      })

      describe('and the request_to_join request exists', () => {
        let joinRequest: MemberRequest
        let requestingUserAddress: string

        beforeEach(() => {
          requestingUserAddress = '0x4444444444444444444444444444444444444444'
          joinRequest = {
            id: requestId,
            communityId: community.id, // Use the same community ID from parent scope
            memberAddress: requestingUserAddress,
            type: CommunityRequestType.RequestToJoin,
            status: CommunityRequestStatus.Pending
          }
          mockCommunitiesDB.getCommunityRequest.mockResolvedValueOnce(joinRequest)
        })

        describe('and the caller is the requesting user', () => {
          beforeEach(() => {
            callerAddress = requestingUserAddress
          })

          describe('and the status is accepted', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Accepted
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })

          describe('and the status is rejected', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Rejected
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })

          describe('and the status is cancelled', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Cancelled
              mockCommunitiesDB.removeCommunityRequest.mockResolvedValueOnce()
            })

            it('should remove the request and do not add user as member', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

              expect(mockCommunitiesDB.removeCommunityRequest).toHaveBeenCalledWith(requestId)
              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
              expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).not.toHaveBeenCalled()
            })

            it('should not publish the community member status updates', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              expect(mockPubsub.publishInChannel).not.toHaveBeenCalled()
            })
          })
        })

        describe('and the caller has community privileges', () => {
          beforeEach(() => {
            callerAddress = '0x5555555555555555555555555555555555555555' // Different from requesting user
            mockCommunityRoles.validatePermissionToAcceptAndRejectRequests.mockResolvedValueOnce()
          })

          describe('and the status is accepted', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Accepted
              mockCommunitiesDB.joinMemberAndRemoveRequests.mockResolvedValueOnce(undefined)
            })

            it('should use transaction to add member and remove request', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).toHaveBeenCalledWith({
                communityId: joinRequest.communityId,
                memberAddress: requestingUserAddress,
                role: CommunityRole.Member
              })
              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).toHaveBeenCalledWith(
                joinRequest.communityId,
                callerAddress
              )
            })

            it('should notify member join through pubsub', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
                communityId: joinRequest.communityId,
                memberAddress: requestingUserAddress,
                status: ConnectivityStatus.ONLINE
              })
            })

            it('should broadcast the request to join accepted event', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              // Wait for async broadcast
              await new Promise((resolve) => setImmediate(resolve))
              expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
                type: Events.Type.COMMUNITY,
                subType: Events.SubType.Community.REQUEST_TO_JOIN_ACCEPTED,
                key: expect.any(String),
                timestamp: expect.any(Number),
                metadata: {
                  communityId: joinRequest.communityId,
                  communityName: expect.any(String),
                  memberAddress: requestingUserAddress,
                  thumbnailUrl: mockCommunityThumbnail.buildThumbnailUrl(joinRequest.communityId)
                }
              } as CommunityRequestToJoinAcceptedEvent)
            })
          })

          describe('and the status is rejected', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Rejected
              mockCommunitiesDB.removeCommunityRequest.mockResolvedValueOnce()
            })

            it('should remove the request and do not add user as member', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

              expect(mockCommunitiesDB.removeCommunityRequest).toHaveBeenCalledWith(requestId)
              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
              expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).toHaveBeenCalledWith(
                joinRequest.communityId,
                callerAddress
              )
            })

            it('should not publish the community member status updates', async () => {
              await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              expect(mockPubsub.publishInChannel).not.toHaveBeenCalled()
            })
          })

          describe('and the status is cancelled', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Cancelled
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })
        })

        describe('and the caller is neither the requesting user nor has privileges', () => {
          beforeEach(() => {
            callerAddress = '0x6666666666666666666666666666666666666666' // Different from requesting user
            mockCommunityRoles.validatePermissionToAcceptAndRejectRequests.mockRejectedValueOnce(
              new NotAuthorizedError('User does not have permission')
            )
          })

          describe('and the status is accepted', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Accepted
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })

          describe('and the status is rejected', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Rejected
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })

          describe('and the status is cancelled', () => {
            let status: Exclude<CommunityRequestStatus, 'pending'>

            beforeEach(() => {
              status = CommunityRequestStatus.Cancelled
            })

            it('should throw NotAuthorizedError', async () => {
              await expect(
                communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
              ).rejects.toThrow(NotAuthorizedError)

              expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.joinMemberAndRemoveRequests).not.toHaveBeenCalled()
            })
          })
        })
      })
    })
  })
})
