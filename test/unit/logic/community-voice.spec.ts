import { NotAuthorizedError } from '@dcl/http-commons'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { createCommunityVoiceComponent } from '../../../src/logic/community-voice'
import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import {
  ICommsGatekeeperComponent,
  IPubSubComponent,
  ICommunitiesDatabaseComponent,
  IRegistryComponent
} from '../../../src/types'
import { createMockProfile } from '../../mocks/profile'
import {
  CommunityVoiceChatAlreadyActiveError,
  CommunityVoiceChatCreationError,
  CommunityVoiceChatNotFoundError,
  CommunityVoiceChatPermissionError,
  UserNotCommunityMemberError,
  InvalidCommunityIdError,
  InvalidUserAddressError
} from '../../../src/logic/community-voice/errors'
import { CommunityRole } from '../../../src/types'
import { AnalyticsEvent, AnalyticsEventPayload } from '../../../src/types/analytics'
import { ICommunityVoiceComponent } from '../../../src/logic/community-voice'
import { ICommunityVoiceChatCacheComponent } from '../../../src/logic/community-voice/community-voice-cache'
import { createCommsGatekeeperMockedComponent } from '../../mocks/components/comms-gatekeeper'
import { CommunityPrivacyEnum, CommunityVisibilityEnum } from '../../../src/logic/community'
import { ICommunityBroadcasterComponent } from '../../../src/logic/community/types'

describe('Community Voice Logic', () => {
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockCommsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let mockCommunitiesDb: Partial<jest.Mocked<ICommunitiesDatabaseComponent>>
  let mockPubsub: jest.Mocked<IPubSubComponent>
  let mockAnalytics: jest.Mocked<IAnalyticsComponent<AnalyticsEventPayload>>
  let mockRegistry: jest.Mocked<IRegistryComponent>
  let communityVoice: ICommunityVoiceComponent
  let logger: jest.Mocked<ReturnType<ILoggerComponent['getLogger']>>
  let mockCommunityVoiceChatCache: jest.Mocked<ICommunityVoiceChatCacheComponent>
  let mockPlacesApi: jest.Mocked<any>
  let mockCommunityThumbnail: jest.Mocked<any>
  let mockCommunityBroadcaster: jest.Mocked<ICommunityBroadcasterComponent>

  const communityId = 'test-community-id'

  beforeEach(async () => {
    logger = {
      log: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }

    mockLogs = {
      getLogger: jest.fn().mockReturnValue(logger)
    } as jest.Mocked<ILoggerComponent>

    mockCommsGatekeeper = createCommsGatekeeperMockedComponent({})

    mockCommunitiesDb = {
      getCommunityMemberRole: jest.fn(),
      getCommunityMemberRoles: jest.fn(),
      getCommunity: jest.fn(),
      isMemberBanned: jest.fn(),
      getBannedMemberAddresses: jest.fn().mockResolvedValue([]),
      getCommunityPlaces: jest.fn()
    }

    mockPubsub = {
      publishInChannel: jest.fn(),
      subscribeToChannel: jest.fn(),
      start: jest.fn(),
      stop: jest.fn()
    } as jest.Mocked<IPubSubComponent>

    mockAnalytics = {
      fireEvent: jest.fn(),
      sendEvent: jest.fn()
    } as jest.Mocked<IAnalyticsComponent<AnalyticsEventPayload>>

    mockRegistry = {
      getProfile: jest.fn(),
      getProfiles: jest.fn()
    } as jest.Mocked<IRegistryComponent>

    mockCommunityVoiceChatCache = {
      getCommunityVoiceChat: jest.fn(),
      setCommunityVoiceChat: jest.fn(),
      deleteCommunityVoiceChat: jest.fn(),
      removeCommunityVoiceChat: jest.fn(),
      getActiveCommunityVoiceChats: jest.fn(),
      updateAndDetectChange: jest.fn(),
      cleanup: jest.fn(),
      size: jest.fn()
    } as jest.Mocked<ICommunityVoiceChatCacheComponent>

    mockPlacesApi = {
      getDestinations: jest.fn()
    }

    mockCommunityThumbnail = {
      getThumbnail: jest.fn()
    }

    mockCommunityBroadcaster = {
      broadcast: jest.fn().mockResolvedValue(undefined)
    }

    const mockCommunityPlaces = {
      getPlaces: jest.fn(),
      validateAndAddPlaces: jest.fn(),
      addPlaces: jest.fn(),
      removePlace: jest.fn(),
      updatePlaces: jest.fn(),
      validateOwnership: jest.fn(),
      getPlacesWithPositionsAndWorlds: jest.fn()
    }

    communityVoice = await createCommunityVoiceComponent({
      logs: mockLogs,
      commsGatekeeper: mockCommsGatekeeper,
      communitiesDb: mockCommunitiesDb as ICommunitiesDatabaseComponent,
      pubsub: mockPubsub,
      analytics: mockAnalytics,
      registry: mockRegistry,
      communityVoiceChatCache: mockCommunityVoiceChatCache,
      placesApi: mockPlacesApi,
      communityThumbnail: mockCommunityThumbnail,
      communityPlaces: mockCommunityPlaces,
      communityBroadcaster: mockCommunityBroadcaster
    })
  })

  describe('when starting a community voice chat', () => {
    const communityId = 'test-community-id'
    const creatorAddress = '0x123'

    describe('when user has permission and voice chat is not active', () => {
      beforeEach(() => {
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: false,
          participantCount: 0,
          moderatorCount: 0
        })
        mockCommsGatekeeper.createCommunityVoiceChatRoom.mockResolvedValue({
          connectionUrl: 'test-connection-url'
        })
      })

      describe('when user is an owner', () => {
        beforeEach(() => {
          mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Owner)
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0x123',
            privacy: CommunityPrivacyEnum.Public,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.Owner
          })
          mockCommunityThumbnail.getThumbnail.mockResolvedValue('test-community.jpg')
          mockCommunitiesDb.getCommunityPlaces!.mockResolvedValue([{ id: 'place-1' }, { id: 'place-2' }])
          mockPlacesApi.getDestinations.mockResolvedValue([
            { id: 'place-1', title: 'Place 1', positions: ['1,1', '1,2'], owner: '0x123' },
            { id: 'place-2', title: 'Place 2', positions: ['2,1', '2,2'], owner: '0x123' }
          ])
        })

        describe('when profile data is available', () => {
          beforeEach(() => {
            mockRegistry.getProfile.mockResolvedValue(createMockProfile(creatorAddress))
          })

          it('should successfully start a community voice chat with profile data', async () => {
            const result = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress)

            expect(result).toEqual({ connectionUrl: 'test-connection-url' })
            expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, creatorAddress)
            expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
            expect(mockCommsGatekeeper.createCommunityVoiceChatRoom).toHaveBeenCalledWith(
              communityId,
              creatorAddress,
              CommunityRole.Owner,
              {
                name: `Profile name ${creatorAddress}`,
                has_claimed_name: true,
                profile_picture_url: 'https://profile-images.decentraland.org/entities/bafybeiasdfqwer/face.png'
              }
            )
            expect(mockCommunityVoiceChatCache.setCommunityVoiceChat).toHaveBeenCalledWith(
              communityId,
              expect.any(Number),
              expect.stringMatching(/^(all|members)$/)
            )
            expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
              communityId,
              status: 0, // ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED
              positions: ['1,1', '1,2', '2,1', '2,2'],
              worlds: [],
              communityName: 'Test Community',
              communityImage: 'test-community.jpg',
              creatorAddress,
              notificationScope: expect.stringMatching(/^(all|members)$/)
            })
            expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.START_COMMUNITY_CALL, {
              call_id: communityId,
              user_id: creatorAddress
            })
          })
        })

        describe('when profile data is not available', () => {
          beforeEach(() => {
            mockRegistry.getProfile.mockRejectedValue(new Error('Profile fetch failed'))
          })

          it('should successfully start a community voice chat without profile data', async () => {
            const result = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress)

            expect(result).toEqual({ connectionUrl: 'test-connection-url' })
            expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, creatorAddress)
            expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
            expect(mockCommsGatekeeper.createCommunityVoiceChatRoom).toHaveBeenCalledWith(
              communityId,
              creatorAddress,
              CommunityRole.Owner,
              null
            )
            expect(mockCommunityVoiceChatCache.setCommunityVoiceChat).toHaveBeenCalledWith(
              communityId,
              expect.any(Number),
              expect.stringMatching(/^(all|members)$/)
            )
            expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
              communityId,
              status: 0, // ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED
              positions: ['1,1', '1,2', '2,1', '2,2'],
              worlds: [],
              communityName: 'Test Community',
              communityImage: 'test-community.jpg',
              creatorAddress,
              notificationScope: expect.stringMatching(/^(all|members)$/)
            })
            expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.START_COMMUNITY_CALL, {
              call_id: communityId,
              user_id: creatorAddress
            })
          })
        })
      })

      describe('when user is a moderator', () => {
        beforeEach(() => {
          mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Moderator)
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0x123',
            privacy: CommunityPrivacyEnum.Public,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.Owner
          })
          mockCommunityThumbnail.getThumbnail.mockResolvedValue('test-community.jpg')
          mockCommunitiesDb.getCommunityPlaces!.mockResolvedValue([{ id: 'place-1' }, { id: 'place-2' }])
          mockPlacesApi.getDestinations.mockResolvedValue([
            { id: 'place-1', title: 'Place 1', positions: ['1,1', '1,2'], owner: '0x123' },
            { id: 'place-2', title: 'Place 2', positions: ['2,1', '2,2'], owner: '0x123' }
          ])
        })

        describe('when profile data is available', () => {
          beforeEach(() => {
            mockRegistry.getProfile.mockResolvedValue(createMockProfile(creatorAddress))
          })

          it('should successfully start a community voice chat with profile data for moderator', async () => {
            const result = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress)

            expect(result).toEqual({ connectionUrl: 'test-connection-url' })
            expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, creatorAddress)
            expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
            expect(mockCommsGatekeeper.createCommunityVoiceChatRoom).toHaveBeenCalledWith(
              communityId,
              creatorAddress,
              CommunityRole.Moderator,
              {
                name: `Profile name ${creatorAddress}`,
                has_claimed_name: true,
                profile_picture_url: 'https://profile-images.decentraland.org/entities/bafybeiasdfqwer/face.png'
              }
            )
            expect(mockCommunityVoiceChatCache.setCommunityVoiceChat).toHaveBeenCalledWith(
              communityId,
              expect.any(Number),
              expect.stringMatching(/^(all|members)$/)
            )
            expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
              communityId,
              status: 0, // ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED
              positions: ['1,1', '1,2', '2,1', '2,2'],
              worlds: [],
              communityName: 'Test Community',
              communityImage: 'test-community.jpg',
              creatorAddress,
              notificationScope: expect.stringMatching(/^(all|members)$/)
            })
            expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.START_COMMUNITY_CALL, {
              call_id: communityId,
              user_id: creatorAddress
            })
          })
        })

        describe('when profile data is not available', () => {
          beforeEach(() => {
            mockRegistry.getProfile.mockRejectedValue(new Error('Profile fetch failed'))
          })

          it('should successfully start a community voice chat without profile data', async () => {
            const result = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress)

            expect(result).toEqual({ connectionUrl: 'test-connection-url' })
            expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, creatorAddress)
            expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
            expect(mockCommsGatekeeper.createCommunityVoiceChatRoom).toHaveBeenCalledWith(
              communityId,
              creatorAddress,
              CommunityRole.Moderator,
              null
            )
            expect(mockCommunityVoiceChatCache.setCommunityVoiceChat).toHaveBeenCalledWith(
              communityId,
              expect.any(Number),
              expect.stringMatching(/^(all|members)$/)
            )
            expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
              communityId,
              status: 0, // ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED
              positions: ['1,1', '1,2', '2,1', '2,2'],
              worlds: [],
              communityName: 'Test Community',
              communityImage: 'test-community.jpg',
              creatorAddress,
              notificationScope: expect.stringMatching(/^(all|members)$/)
            })
            expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.START_COMMUNITY_CALL, {
              call_id: communityId,
              user_id: creatorAddress
            })
          })
        })

        describe('when getCommunityPlaces fails', () => {
          beforeEach(() => {
            mockRegistry.getProfile.mockResolvedValue(createMockProfile(creatorAddress))
            mockCommunitiesDb.getCommunityPlaces!.mockRejectedValue(new Error('Places fetch failed'))
          })

          it('should successfully start a community voice chat without positions', async () => {
            const result = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress)

            expect(result).toEqual({ connectionUrl: 'test-connection-url' })
            expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
              communityId,
              status: 0, // ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED
              positions: [],
              worlds: [],
              communityName: 'Test Community', // Still gets community info even when places fail
              communityImage: 'test-community.jpg',
              creatorAddress,
              notificationScope: expect.stringMatching(/^(all|members)$/)
            })
          })
        })

        describe('when placesApi fails', () => {
          beforeEach(() => {
            mockRegistry.getProfile.mockResolvedValue(createMockProfile(creatorAddress))
            mockCommunitiesDb.getCommunityPlaces!.mockResolvedValue([{ id: 'place-1' }])
            mockPlacesApi.getDestinations.mockRejectedValue(new Error('PlacesApi failed'))
          })

          it('should successfully start a community voice chat without positions', async () => {
            const result = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress)

            expect(result).toEqual({ connectionUrl: 'test-connection-url' })
            expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
              communityId,
              status: 0, // ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED
              positions: [],
              worlds: [],
              communityName: 'Test Community', // Still gets community info even when placesApi fails
              communityImage: 'test-community.jpg',
              creatorAddress,
              notificationScope: expect.stringMatching(/^(all|members)$/)
            })
          })
        })
      })
    })

    describe('when user does not have permission', () => {
      describe('when user is not a member', () => {
        beforeEach(() => {
          mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.None)
        })

        it('should throw UserNotCommunityMemberError', async () => {
          await expect(communityVoice.startCommunityVoiceChat(communityId, creatorAddress)).rejects.toThrow(
            UserNotCommunityMemberError
          )
        })
      })

      describe('when user is only a member', () => {
        beforeEach(() => {
          mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Member)
        })

        it('should throw CommunityVoiceChatPermissionError', async () => {
          await expect(communityVoice.startCommunityVoiceChat(communityId, creatorAddress)).rejects.toThrow(
            CommunityVoiceChatPermissionError
          )
        })
      })

      describe('when user is a banned owner', () => {
        let startError: unknown

        beforeEach(async () => {
          mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Owner)
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(true)
          startError = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress).catch((error) => error)
        })

        it('should reject with a CommunityVoiceChatPermissionError', () => {
          expect(startError).toBeInstanceOf(CommunityVoiceChatPermissionError)
        })

        it('should not create the voice chat room', () => {
          expect(mockCommsGatekeeper.createCommunityVoiceChatRoom).not.toHaveBeenCalled()
        })
      })

      describe('when user is a banned moderator', () => {
        let startError: unknown

        beforeEach(async () => {
          mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Moderator)
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(true)
          startError = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress).catch((error) => error)
        })

        it('should reject with a CommunityVoiceChatPermissionError', () => {
          expect(startError).toBeInstanceOf(CommunityVoiceChatPermissionError)
        })

        it('should not create the voice chat room', () => {
          expect(mockCommsGatekeeper.createCommunityVoiceChatRoom).not.toHaveBeenCalled()
        })
      })
    })

    describe('when voice chat is already active', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Owner)
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: true,
          participantCount: 1,
          moderatorCount: 1
        })
      })

      it('should throw CommunityVoiceChatAlreadyActiveError', async () => {
        await expect(communityVoice.startCommunityVoiceChat(communityId, creatorAddress)).rejects.toThrow(
          CommunityVoiceChatAlreadyActiveError
        )
      })
    })

    describe('when creation fails', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Owner)
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: false,
          participantCount: 0,
          moderatorCount: 0
        })
        mockCommsGatekeeper.createCommunityVoiceChatRoom.mockRejectedValue(new Error('Creation failed'))
      })

      it('should throw CommunityVoiceChatCreationError', async () => {
        await expect(communityVoice.startCommunityVoiceChat(communityId, creatorAddress)).rejects.toThrow(
          CommunityVoiceChatCreationError
        )
      })
    })
  })

  describe('when ending a community voice chat', () => {
    const communityId = 'test-community-id'
    const userAddress = '0x123'

    describe('when user has permission and voice chat is active', () => {
      beforeEach(() => {
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: true,
          participantCount: 5,
          moderatorCount: 1
        })
        mockCommsGatekeeper.endCommunityVoiceChatRoom.mockResolvedValue(undefined)
      })

      describe('when user is an owner', () => {
        beforeEach(() => {
          mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Owner)
        })

        it('should successfully end a community voice chat', async () => {
          await communityVoice.endCommunityVoiceChat(communityId, userAddress)

          expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
          expect(mockCommsGatekeeper.endCommunityVoiceChatRoom).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunityVoiceChatCache.removeCommunityVoiceChat).toHaveBeenCalledWith(communityId)
          expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
            communityId,
            status: 1, // ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_ENDED
            positions: undefined,
            worlds: undefined,
            communityName: undefined,
            communityImage: undefined
          })
          expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.END_COMMUNITY_CALL, {
            call_id: communityId,
            user_id: userAddress
          })
        })
      })

      describe('when user is a moderator', () => {
        beforeEach(() => {
          mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Moderator)
        })

        it('should successfully end a community voice chat as moderator', async () => {
          await communityVoice.endCommunityVoiceChat(communityId, userAddress)

          expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
          expect(mockCommsGatekeeper.endCommunityVoiceChatRoom).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunityVoiceChatCache.removeCommunityVoiceChat).toHaveBeenCalledWith(communityId)
          expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.END_COMMUNITY_CALL, {
            call_id: communityId,
            user_id: userAddress
          })
        })
      })
    })

    describe('when user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.None)
      })

      it('should throw UserNotCommunityMemberError', async () => {
        await expect(communityVoice.endCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
          UserNotCommunityMemberError
        )
      })
    })

    describe('when user does not have permission', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Member)
      })

      it('should throw CommunityVoiceChatPermissionError', async () => {
        await expect(communityVoice.endCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
          CommunityVoiceChatPermissionError
        )
      })
    })

    describe('when user is a banned owner', () => {
      let endError: unknown

      beforeEach(async () => {
        mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Owner)
        mockCommunitiesDb.isMemberBanned!.mockResolvedValue(true)
        endError = await communityVoice.endCommunityVoiceChat(communityId, userAddress).catch((error) => error)
      })

      it('should reject with a CommunityVoiceChatPermissionError', () => {
        expect(endError).toBeInstanceOf(CommunityVoiceChatPermissionError)
      })

      it('should not end the voice chat room', () => {
        expect(mockCommsGatekeeper.endCommunityVoiceChatRoom).not.toHaveBeenCalled()
      })
    })

    describe('when user is a banned moderator', () => {
      let endError: unknown

      beforeEach(async () => {
        mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Moderator)
        mockCommunitiesDb.isMemberBanned!.mockResolvedValue(true)
        endError = await communityVoice.endCommunityVoiceChat(communityId, userAddress).catch((error) => error)
      })

      it('should reject with a CommunityVoiceChatPermissionError', () => {
        expect(endError).toBeInstanceOf(CommunityVoiceChatPermissionError)
      })

      it('should not end the voice chat room', () => {
        expect(mockCommsGatekeeper.endCommunityVoiceChatRoom).not.toHaveBeenCalled()
      })
    })

    describe('when voice chat is not active', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Owner)
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: false,
          participantCount: 0,
          moderatorCount: 0
        })
      })

      it('should throw CommunityVoiceChatNotFoundError', async () => {
        await expect(communityVoice.endCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
          CommunityVoiceChatNotFoundError
        )
      })
    })
  })

  describe('joinCommunityVoiceChat', () => {
    const communityId = 'test-community-id'
    const userAddress = '0x456'

    describe('when voice chat is active and user can join', () => {
      beforeEach(() => {
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: true,
          participantCount: 5,
          moderatorCount: 1
        })
      })

      describe('when joining private community as a member', () => {
        beforeEach(() => {
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0x123',
            privacy: CommunityPrivacyEnum.Private,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.Member
          })
          mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Member)
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(false)
          mockCommsGatekeeper.getCommunityVoiceChatCredentials.mockResolvedValue({
            connectionUrl: 'test-connection-url'
          })
        })

        describe('when profile data is available', () => {
          beforeEach(() => {
            mockRegistry.getProfile.mockResolvedValue(createMockProfile(userAddress))
          })

          it('should successfully join community voice chat with profile data', async () => {
            const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

            expect(result).toEqual({ connectionUrl: 'test-connection-url' })
            expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
              communityId,
              userAddress,
              CommunityRole.Member,
              {
                name: `Profile name ${userAddress}`,
                has_claimed_name: true,
                profile_picture_url: 'https://profile-images.decentraland.org/entities/bafybeiasdfqwer/face.png'
              }
            )
            expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.JOIN_COMMUNITY_CALL, {
              call_id: communityId,
              user_id: userAddress
            })
          })
        })

        describe('when profile data is not available', () => {
          beforeEach(() => {
            mockRegistry.getProfile.mockRejectedValue(new Error('Profile fetch failed'))
          })

          it('should successfully join community voice chat without profile data', async () => {
            const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

            expect(result).toEqual({ connectionUrl: 'test-connection-url' })
            expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
              communityId,
              userAddress,
              CommunityRole.Member,
              null
            )
            expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.JOIN_COMMUNITY_CALL, {
              call_id: communityId,
              user_id: userAddress
            })
          })
        })
      })

      describe('when joining public community as non-member', () => {
        beforeEach(() => {
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Public Test Community',
            description: 'Public community for testing',
            ownerAddress: '0x123',
            privacy: CommunityPrivacyEnum.Public,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.None
          })
          mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(null) // User is not a member
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(false)
          mockCommsGatekeeper.getCommunityVoiceChatCredentials.mockResolvedValue({
            connectionUrl: 'test-public-connection-url'
          })
        })

        describe('when profile data is available', () => {
          beforeEach(() => {
            mockRegistry.getProfile.mockResolvedValue({
              avatars: [
                {
                  unclaimedName: 'PublicUser#0456',
                  hasClaimedName: false,
                  userId: userAddress,
                  avatar: {
                    snapshots: {
                      face256: 'https://example.com/public-face.png'
                    }
                  }
                }
              ]
            } as any)
            mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
          })

          it('should successfully join without membership check with profile data', async () => {
            const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

            expect(result).toEqual({ connectionUrl: 'test-public-connection-url' })
            expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
              communityId,
              userAddress,
              CommunityRole.None,
              {
                name: 'PublicUser#0456',
                has_claimed_name: false,
                profile_picture_url: 'https://example.com/public-face.png'
              }
            )
            expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.JOIN_COMMUNITY_CALL, {
              call_id: communityId,
              user_id: userAddress
            })
          })
        })

        describe('when profile data is not available', () => {
          beforeEach(() => {
            mockRegistry.getProfile.mockRejectedValue(new Error('Profile fetch failed'))
            mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
          })

          it('should successfully join without membership check and without profile data', async () => {
            const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

            expect(result).toEqual({ connectionUrl: 'test-public-connection-url' })
            expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
              communityId,
              userAddress,
              CommunityRole.None,
              null
            )
            expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.JOIN_COMMUNITY_CALL, {
              call_id: communityId,
              user_id: userAddress
            })
          })
        })
      })
    })

    describe('when user cannot join', () => {
      beforeEach(() => {
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: true,
          participantCount: 5,
          moderatorCount: 1
        })
      })

      describe('when user is not a member of private community', () => {
        beforeEach(() => {
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Private Test Community',
            description: 'Private community for testing',
            ownerAddress: '0x123',
            privacy: CommunityPrivacyEnum.Private,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.None
          })
          mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.None)
        })

        it('should throw UserNotCommunityMemberError', async () => {
          await expect(communityVoice.joinCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
            UserNotCommunityMemberError
          )
          expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
          expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).not.toHaveBeenCalled()
        })
      })

      describe('when user is banned from public community', () => {
        beforeEach(() => {
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0x123',
            privacy: CommunityPrivacyEnum.Public,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.None
          })
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(true)
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(communityVoice.joinCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
            new NotAuthorizedError(`The user ${userAddress} is banned from community ${communityId}`)
          )
          expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
          expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDb.isMemberBanned).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).not.toHaveBeenCalled()
        })
      })

      describe('when member user is banned from private community', () => {
        beforeEach(() => {
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Private Test Community',
            description: 'Test Description',
            ownerAddress: '0x123',
            privacy: CommunityPrivacyEnum.Private,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.Member
          })
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(true)
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(communityVoice.joinCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
            new NotAuthorizedError(`The user ${userAddress} is banned from community ${communityId}`)
          )
          expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
          expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDb.isMemberBanned).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).not.toHaveBeenCalled()
        })
      })
    })

    describe('when voice chat is not active', () => {
      beforeEach(() => {
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: false,
          participantCount: 0,
          moderatorCount: 0
        })
      })

      it('should throw CommunityVoiceChatNotFoundError', async () => {
        await expect(communityVoice.joinCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
          CommunityVoiceChatNotFoundError
        )
      })
    })

    describe('when community is not found', () => {
      beforeEach(() => {
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: true,
          participantCount: 1,
          moderatorCount: 1
        })
        mockCommunitiesDb.getCommunity!.mockResolvedValue(null)
      })

      it('should throw CommunityVoiceChatNotFoundError', async () => {
        await expect(communityVoice.joinCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
          CommunityVoiceChatNotFoundError
        )
      })
    })
  })

  describe('when getting a community voice chat', () => {
    const communityId = 'test-community-id'

    describe('when voice chat is active', () => {
      beforeEach(() => {
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: true,
          participantCount: 1,
          moderatorCount: 1
        })
      })

      it('should return community voice chat', async () => {
        const result = await communityVoice.getCommunityVoiceChat(communityId)

        expect(result).toMatchObject({
          id: communityId,
          community_id: communityId,
          status: 'active'
        })
      })
    })

    describe('when voice chat is not active', () => {
      beforeEach(() => {
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: false,
          participantCount: 0,
          moderatorCount: 0
        })
      })

      it('should return null', async () => {
        const result = await communityVoice.getCommunityVoiceChat(communityId)

        expect(result).toBeNull()
      })
    })
  })

  describe('when muting a speaker in a community voice chat', () => {
    let targetUserAddress: string
    let actingUserAddress: string

    beforeEach(() => {
      targetUserAddress = '0x1234567890abcdef'
      actingUserAddress = '0xabcdef1234567890'
      mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat.mockResolvedValue(undefined)
    })

    describe('and the acting user is a moderator muting another member', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Member
        })
      })

      it('should mute the target user', async () => {
        await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)

        expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          targetUserAddress.toLowerCase(),
          true
        )
      })

      it('should unmute the target user', async () => {
        await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, false)

        expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          targetUserAddress.toLowerCase(),
          false
        )
      })

      it('should resolve both roles with a single batched query', async () => {
        await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)

        expect(mockCommunitiesDb.getCommunityMemberRoles).toHaveBeenCalledWith(communityId, [
          actingUserAddress.toLowerCase(),
          targetUserAddress.toLowerCase()
        ])
      })

      it('should fire the mute analytics event', async () => {
        await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)

        expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.MUTE_SPEAKER_IN_COMMUNITY_CALL, {
          call_id: communityId,
          user_id: actingUserAddress,
          target_user_id: targetUserAddress
        })
      })
    })

    describe('and the acting user is an owner muting a moderator', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Owner,
          [targetUserAddress]: CommunityRole.Moderator
        })
      })

      it('should mute the moderator', async () => {
        await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)

        expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          targetUserAddress.toLowerCase(),
          true
        )
      })
    })

    describe('and a moderator tries to mute the community owner', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Owner
        })
      })

      it('should throw a permission error', async () => {
        await expect(
          communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)
        ).rejects.toThrow(CommunityVoiceChatPermissionError)
      })

      it('should not reach the comms gatekeeper', async () => {
        await expect(
          communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)
        ).rejects.toThrow(CommunityVoiceChatPermissionError)

        expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).not.toHaveBeenCalled()
      })
    })

    describe('and a moderator mutes another moderator', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Moderator
        })
      })

      it('should mute them, so a peer can silence a hot mic without the owner present', async () => {
        await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)

        expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          targetUserAddress.toLowerCase(),
          true
        )
      })
    })
    describe('and the acting user is a regular member muting someone else', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Member,
          [targetUserAddress]: CommunityRole.Member
        })
      })

      it('should throw a permission error', async () => {
        await expect(
          communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)
        ).rejects.toThrow(CommunityVoiceChatPermissionError)
      })

      it('should not reach the comms gatekeeper', async () => {
        await expect(
          communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)
        ).rejects.toThrow(CommunityVoiceChatPermissionError)

        expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).not.toHaveBeenCalled()
      })
    })

    describe('and the acting user has no role muting someone else', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({})
      })

      it('should throw a permission error', async () => {
        await expect(
          communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)
        ).rejects.toThrow(CommunityVoiceChatPermissionError)
      })
    })

    describe('and the acting user is a banned moderator muting someone else', () => {
      let thrownError: Error | undefined

      beforeEach(async () => {
        thrownError = undefined
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Member
        })
        mockCommunitiesDb.getBannedMemberAddresses!.mockResolvedValue([actingUserAddress])

        try {
          await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)
        } catch (error) {
          thrownError = error as Error
        }
      })

      it('should throw a permission error', () => {
        expect(thrownError).toBeInstanceOf(CommunityVoiceChatPermissionError)
      })

      it('should not reach the comms gatekeeper', () => {
        expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).not.toHaveBeenCalled()
      })
    })

    describe('and the acting user is a banned owner muting someone else', () => {
      let thrownError: Error | undefined

      beforeEach(async () => {
        thrownError = undefined
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Owner,
          [targetUserAddress]: CommunityRole.Member
        })
        mockCommunitiesDb.getBannedMemberAddresses!.mockResolvedValue([actingUserAddress])

        try {
          await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)
        } catch (error) {
          thrownError = error as Error
        }
      })

      it('should throw a permission error', () => {
        expect(thrownError).toBeInstanceOf(CommunityVoiceChatPermissionError)
      })

      it('should not reach the comms gatekeeper', () => {
        expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).not.toHaveBeenCalled()
      })
    })

    describe('and a moderator mutes a banned member still in the room', () => {
      beforeEach(async () => {
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Member
        })
        mockCommunitiesDb.getBannedMemberAddresses!.mockResolvedValue([targetUserAddress])

        await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)
      })

      it('should mute them, since silencing a banned speaker must not be blocked', () => {
        expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          targetUserAddress.toLowerCase(),
          true
        )
      })
    })

    describe('and the acting user is a moderator who is not banned', () => {
      beforeEach(async () => {
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Member
        })

        await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)
      })

      it('should resolve both ban statuses with a single batched query', () => {
        expect(mockCommunitiesDb.getBannedMemberAddresses).toHaveBeenCalledTimes(1)
        expect(mockCommunitiesDb.getBannedMemberAddresses).toHaveBeenCalledWith(communityId, [
          actingUserAddress.toLowerCase(),
          targetUserAddress.toLowerCase()
        ])
      })
    })

    describe('and the user is muting themselves', () => {
      describe('and they are a member of an active private community room', () => {
        beforeEach(() => {
          mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: true,
            participantCount: 2,
            moderatorCount: 1
          })
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Private Test Community',
            description: 'Test Description',
            ownerAddress: '0xowner',
            privacy: CommunityPrivacyEnum.Private,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.Member
          })
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(false)
        })

        it('should mute themselves', async () => {
          await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, targetUserAddress, true)

          expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
            communityId,
            targetUserAddress.toLowerCase(),
            true
          )
        })

        it('should unmute themselves', async () => {
          await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, targetUserAddress, false)

          expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
            communityId,
            targetUserAddress.toLowerCase(),
            false
          )
        })

        it('should not run the moderation hierarchy check', async () => {
          await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, targetUserAddress, true)

          expect(mockCommunitiesDb.getCommunityMemberRoles).not.toHaveBeenCalled()
        })
      })

      describe('and they are a guest of an active public community room', () => {
        beforeEach(() => {
          mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: true,
            participantCount: 2,
            moderatorCount: 1
          })
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0xowner',
            privacy: CommunityPrivacyEnum.Public,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.None
          })
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(false)
        })

        it('should unmute themselves', async () => {
          await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, targetUserAddress, false)

          expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
            communityId,
            targetUserAddress.toLowerCase(),
            false
          )
        })
      })

      describe('and they are not a member of a private community', () => {
        beforeEach(() => {
          mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: true,
            participantCount: 2,
            moderatorCount: 1
          })
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Private Test Community',
            description: 'Test Description',
            ownerAddress: '0xowner',
            privacy: CommunityPrivacyEnum.Private,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.None
          })
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(false)
        })

        it('should throw UserNotCommunityMemberError', async () => {
          await expect(
            communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, targetUserAddress, false)
          ).rejects.toThrow(UserNotCommunityMemberError)
        })

        it('should not reach the comms gatekeeper', async () => {
          await expect(
            communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, targetUserAddress, false)
          ).rejects.toThrow(UserNotCommunityMemberError)

          expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).not.toHaveBeenCalled()
        })
      })

      describe('and they are banned from the community', () => {
        beforeEach(() => {
          mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: true,
            participantCount: 2,
            moderatorCount: 1
          })
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0xowner',
            privacy: CommunityPrivacyEnum.Public,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.None
          })
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(true)
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(
            communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, targetUserAddress, false)
          ).rejects.toThrow(NotAuthorizedError)
        })

        it('should not reach the comms gatekeeper', async () => {
          await expect(
            communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, targetUserAddress, false)
          ).rejects.toThrow(NotAuthorizedError)

          expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).not.toHaveBeenCalled()
        })
      })

      describe('and there is no active voice chat for the community', () => {
        beforeEach(() => {
          mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: false,
            participantCount: 0,
            moderatorCount: 0
          })
          mockCommunitiesDb.getCommunity!.mockResolvedValue({
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0xowner',
            privacy: CommunityPrivacyEnum.Public,
            visibility: CommunityVisibilityEnum.All,
            active: true,
            role: CommunityRole.Member
          })
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(false)
        })

        it('should throw CommunityVoiceChatNotFoundError', async () => {
          await expect(
            communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, targetUserAddress, false)
          ).rejects.toThrow(CommunityVoiceChatNotFoundError)
        })
      })

      describe('and the community no longer exists', () => {
        beforeEach(() => {
          mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
            isActive: true,
            participantCount: 2,
            moderatorCount: 1
          })
          mockCommunitiesDb.getCommunity!.mockResolvedValue(null as never)
          mockCommunitiesDb.isMemberBanned!.mockResolvedValue(false)
        })

        it('should throw CommunityVoiceChatNotFoundError', async () => {
          await expect(
            communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, targetUserAddress, false)
          ).rejects.toThrow(CommunityVoiceChatNotFoundError)
        })
      })
    })

    describe('and the community id is empty', () => {
      it('should throw InvalidCommunityIdError', async () => {
        await expect(
          communityVoice.muteSpeakerInCommunityVoiceChat('', targetUserAddress, actingUserAddress, true)
        ).rejects.toThrow(InvalidCommunityIdError)
      })

      it('should throw InvalidCommunityIdError for a blank community id', async () => {
        await expect(
          communityVoice.muteSpeakerInCommunityVoiceChat('   ', targetUserAddress, actingUserAddress, true)
        ).rejects.toThrow(InvalidCommunityIdError)
      })
    })

    describe('and the target user address is empty', () => {
      it('should throw InvalidUserAddressError', async () => {
        await expect(
          communityVoice.muteSpeakerInCommunityVoiceChat(communityId, '', actingUserAddress, true)
        ).rejects.toThrow(InvalidUserAddressError)
      })

      it('should throw InvalidUserAddressError for a blank user address', async () => {
        await expect(
          communityVoice.muteSpeakerInCommunityVoiceChat(communityId, '   ', actingUserAddress, true)
        ).rejects.toThrow(InvalidUserAddressError)
      })
    })

    describe('and the comms gatekeeper fails', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({
          [actingUserAddress]: CommunityRole.Moderator,
          [targetUserAddress]: CommunityRole.Member
        })
        mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat.mockRejectedValue(new Error('Comms gatekeeper error'))
      })

      it('should propagate the error from the comms gatekeeper', async () => {
        await expect(
          communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetUserAddress, actingUserAddress, true)
        ).rejects.toThrow('Comms gatekeeper error')
      })
    })

    describe('and the addresses are checksummed', () => {
      let upperCaseTargetAddress: string
      let upperCaseActingAddress: string

      beforeEach(() => {
        upperCaseTargetAddress = '0x1234567890ABCDEF'
        upperCaseActingAddress = '0xABCDEF1234567890'
        mockCommunitiesDb.getCommunityMemberRoles!.mockResolvedValue({
          [upperCaseActingAddress.toLowerCase()]: CommunityRole.Moderator,
          [upperCaseTargetAddress.toLowerCase()]: CommunityRole.Member
        })
      })

      it('should convert the addresses to lowercase before calling the comms gatekeeper', async () => {
        await communityVoice.muteSpeakerInCommunityVoiceChat(
          communityId,
          upperCaseTargetAddress,
          upperCaseActingAddress,
          true
        )

        expect(mockCommsGatekeeper.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          upperCaseTargetAddress.toLowerCase(),
          true
        )
      })
    })
  })

  describe('when requesting to speak in a community voice chat', () => {
    let userAddress: string

    beforeEach(() => {
      userAddress = '0x1234567890abcdef'
      mockCommsGatekeeper.requestToSpeakInCommunityVoiceChat.mockResolvedValue(undefined)
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: true,
        participantCount: 2,
        moderatorCount: 1
      })
      mockCommunitiesDb.isMemberBanned!.mockResolvedValue(false)
    })

    describe('and the user is a member of an active private community room', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunity!.mockResolvedValue({
          id: communityId,
          name: 'Private Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: CommunityPrivacyEnum.Private,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.Member
        })
      })

      it('should raise the hand in the room', async () => {
        await communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, true)

        expect(mockCommsGatekeeper.requestToSpeakInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          userAddress,
          true
        )
      })

      it('should lower the hand in the room', async () => {
        await communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, false)

        expect(mockCommsGatekeeper.requestToSpeakInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          userAddress,
          false
        )
      })
    })

    describe('and the user is a guest of an active public community room', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunity!.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: CommunityPrivacyEnum.Public,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.None
        })
      })

      it('should raise the hand in the room', async () => {
        await communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, true)

        expect(mockCommsGatekeeper.requestToSpeakInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          userAddress,
          true
        )
      })
    })

    describe('and the user is not a member of a private community', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunity!.mockResolvedValue({
          id: communityId,
          name: 'Private Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: CommunityPrivacyEnum.Private,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.None
        })
      })

      it('should throw UserNotCommunityMemberError', async () => {
        await expect(communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, true)).rejects.toThrow(
          UserNotCommunityMemberError
        )
      })

      it('should not reach the comms gatekeeper', async () => {
        await expect(communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, true)).rejects.toThrow(
          UserNotCommunityMemberError
        )

        expect(mockCommsGatekeeper.requestToSpeakInCommunityVoiceChat).not.toHaveBeenCalled()
      })
    })

    describe('and the user is banned from the community', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunity!.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: CommunityPrivacyEnum.Public,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.Member
        })
        mockCommunitiesDb.isMemberBanned!.mockResolvedValue(true)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, true)).rejects.toThrow(
          NotAuthorizedError
        )
      })

      it('should not reach the comms gatekeeper', async () => {
        await expect(communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, true)).rejects.toThrow(
          NotAuthorizedError
        )

        expect(mockCommsGatekeeper.requestToSpeakInCommunityVoiceChat).not.toHaveBeenCalled()
      })

      it('should still let them lower a raised hand, which gives up a capability rather than gaining one', async () => {
        await communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, false)

        expect(mockCommsGatekeeper.requestToSpeakInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          userAddress,
          false
        )
      })
    })

    describe('and there is no active voice chat for the community', () => {
      beforeEach(() => {
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
          isActive: false,
          participantCount: 0,
          moderatorCount: 0
        })
        mockCommunitiesDb.getCommunity!.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: CommunityPrivacyEnum.Public,
          visibility: CommunityVisibilityEnum.All,
          active: true,
          role: CommunityRole.Member
        })
      })

      it('should throw CommunityVoiceChatNotFoundError', async () => {
        await expect(communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, true)).rejects.toThrow(
          CommunityVoiceChatNotFoundError
        )
      })

      it('should not reach the comms gatekeeper', async () => {
        await expect(communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, true)).rejects.toThrow(
          CommunityVoiceChatNotFoundError
        )

        expect(mockCommsGatekeeper.requestToSpeakInCommunityVoiceChat).not.toHaveBeenCalled()
      })
    })

    describe('and the community no longer exists', () => {
      beforeEach(() => {
        mockCommunitiesDb.getCommunity!.mockResolvedValue(null as never)
      })

      it('should throw CommunityVoiceChatNotFoundError', async () => {
        await expect(communityVoice.requestToSpeakInCommunityVoiceChat(communityId, userAddress, true)).rejects.toThrow(
          CommunityVoiceChatNotFoundError
        )
      })
    })

    describe('and the community id is empty', () => {
      it('should throw InvalidCommunityIdError', async () => {
        await expect(communityVoice.requestToSpeakInCommunityVoiceChat('', userAddress, true)).rejects.toThrow(
          InvalidCommunityIdError
        )
      })
    })

    describe('and the user address is empty', () => {
      it('should throw InvalidUserAddressError', async () => {
        await expect(communityVoice.requestToSpeakInCommunityVoiceChat(communityId, '', true)).rejects.toThrow(
          InvalidUserAddressError
        )
      })
    })
  })
})
