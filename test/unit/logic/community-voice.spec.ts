import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { createCommunityVoiceComponent } from '../../../src/logic/community-voice'
import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import {
  ICommsGatekeeperComponent,
  IPubSubComponent,
  ICommunitiesDatabaseComponent,
  ICatalystClientComponent
} from '../../../src/types'
import { createMockProfile } from '../../mocks/profile'
import {
  CommunityVoiceChatAlreadyActiveError,
  CommunityVoiceChatCreationError,
  CommunityVoiceChatNotFoundError,
  CommunityVoiceChatPermissionError,
  UserNotCommunityMemberError
} from '../../../src/logic/community-voice/errors'
import { CommunityRole } from '../../../src/types'
import { AnalyticsEvent, AnalyticsEventPayload } from '../../../src/types/analytics'
import { ICommunityVoiceComponent } from '../../../src/logic/community-voice'
import { ICommunityVoiceChatCacheComponent } from '../../../src/logic/community-voice/community-voice-cache'
import { createCommsGatekeeperMockedComponent } from '../../mocks/components/comms-gatekeeper'
import { CommunityPrivacyEnum } from '../../../src/logic/community'

describe('Community Voice Logic', () => {
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockCommsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let mockCommunitiesDb: Partial<jest.Mocked<ICommunitiesDatabaseComponent>>
  let mockPubsub: jest.Mocked<IPubSubComponent>
  let mockAnalytics: jest.Mocked<IAnalyticsComponent<AnalyticsEventPayload>>
  let mockCatalystClient: jest.Mocked<ICatalystClientComponent>
  let communityVoice: ICommunityVoiceComponent
  let logger: jest.Mocked<ReturnType<ILoggerComponent['getLogger']>>
  let mockCommunityVoiceChatCache: jest.Mocked<ICommunityVoiceChatCacheComponent>
  let mockPlacesApi: jest.Mocked<any>
  let mockCommunityThumbnail: jest.Mocked<any>

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
      getCommunity: jest.fn(),
      isMemberBanned: jest.fn(),
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

    mockCatalystClient = {
      getProfile: jest.fn(),
      getProfiles: jest.fn(),
      getOwnedNames: jest.fn()
    } as jest.Mocked<ICatalystClientComponent>

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
      getPlaces: jest.fn()
    }

    mockCommunityThumbnail = {
      getThumbnail: jest.fn()
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
      catalystClient: mockCatalystClient,
      communityVoiceChatCache: mockCommunityVoiceChatCache,
      placesApi: mockPlacesApi,
      communityThumbnail: mockCommunityThumbnail,
      communityPlaces: mockCommunityPlaces
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
            active: true,
            role: CommunityRole.Owner
          })
          mockCommunityThumbnail.getThumbnail.mockResolvedValue('test-community.jpg')
          mockCommunitiesDb.getCommunityPlaces!.mockResolvedValue([{ id: 'place-1' }, { id: 'place-2' }])
          mockPlacesApi.getPlaces.mockResolvedValue([
            { id: 'place-1', title: 'Place 1', positions: ['1,1', '1,2'], owner: '0x123' },
            { id: 'place-2', title: 'Place 2', positions: ['2,1', '2,2'], owner: '0x123' }
          ])
        })

        describe('when profile data is available', () => {
          beforeEach(() => {
            mockCatalystClient.getProfile.mockResolvedValue(createMockProfile(creatorAddress))
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
              expect.any(Number)
            )
            expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
              communityId,
              status: 0, // ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED
              positions: ['1,1', '1,2', '2,1', '2,2'],
              worlds: [],
              communityName: 'Test Community',
              communityImage: 'test-community.jpg'
            })
            expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.START_COMMUNITY_CALL, {
              call_id: communityId,
              user_id: creatorAddress
            })
          })
        })

        describe('when profile data is not available', () => {
          beforeEach(() => {
            mockCatalystClient.getProfile.mockRejectedValue(new Error('Profile fetch failed'))
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
              expect.any(Number)
            )
            expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
              communityId,
              status: 0, // ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED
              positions: ['1,1', '1,2', '2,1', '2,2'],
              worlds: [],
              communityName: 'Test Community',
              communityImage: 'test-community.jpg'
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
            active: true,
            role: CommunityRole.Owner
          })
          mockCommunityThumbnail.getThumbnail.mockResolvedValue('test-community.jpg')
          mockCommunitiesDb.getCommunityPlaces!.mockResolvedValue([{ id: 'place-1' }, { id: 'place-2' }])
          mockPlacesApi.getPlaces.mockResolvedValue([
            { id: 'place-1', title: 'Place 1', positions: ['1,1', '1,2'], owner: '0x123' },
            { id: 'place-2', title: 'Place 2', positions: ['2,1', '2,2'], owner: '0x123' }
          ])
        })

        describe('when profile data is available', () => {
          beforeEach(() => {
            mockCatalystClient.getProfile.mockResolvedValue(createMockProfile(creatorAddress))
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
              expect.any(Number)
            )
            expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
              communityId,
              status: 0, // ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED
              positions: ['1,1', '1,2', '2,1', '2,2'],
              worlds: [],
              communityName: 'Test Community',
              communityImage: 'test-community.jpg'
            })
            expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.START_COMMUNITY_CALL, {
              call_id: communityId,
              user_id: creatorAddress
            })
          })
        })

        describe('when profile data is not available', () => {
          beforeEach(() => {
            mockCatalystClient.getProfile.mockRejectedValue(new Error('Profile fetch failed'))
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
              expect.any(Number)
            )
            expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
              communityId,
              status: 0, // ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED
              positions: ['1,1', '1,2', '2,1', '2,2'],
              worlds: [],
              communityName: 'Test Community',
              communityImage: 'test-community.jpg'
            })
            expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.START_COMMUNITY_CALL, {
              call_id: communityId,
              user_id: creatorAddress
            })
          })
        })

        describe('when getCommunityPlaces fails', () => {
          beforeEach(() => {
            mockCatalystClient.getProfile.mockResolvedValue(createMockProfile(creatorAddress))
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
              communityImage: 'test-community.jpg'
            })
          })
        })

        describe('when placesApi fails', () => {
          beforeEach(() => {
            mockCatalystClient.getProfile.mockResolvedValue(createMockProfile(creatorAddress))
            mockCommunitiesDb.getCommunityPlaces!.mockResolvedValue([{ id: 'place-1' }])
            mockPlacesApi.getPlaces.mockRejectedValue(new Error('PlacesApi failed'))
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
              communityImage: 'test-community.jpg'
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
            mockCatalystClient.getProfile.mockResolvedValue(createMockProfile(userAddress))
          })

          it('should successfully join community voice chat with profile data', async () => {
            const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

            expect(result).toEqual({ connectionUrl: 'test-connection-url' })
            expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
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
          })
        })

        describe('when profile data is not available', () => {
          beforeEach(() => {
            mockCatalystClient.getProfile.mockRejectedValue(new Error('Profile fetch failed'))
          })

          it('should successfully join community voice chat without profile data', async () => {
            const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

            expect(result).toEqual({ connectionUrl: 'test-connection-url' })
            expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
              communityId,
              userAddress,
              CommunityRole.Member,
              null
            )
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
            mockCatalystClient.getProfile.mockResolvedValue({
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
            expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
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
          })
        })

        describe('when profile data is not available', () => {
          beforeEach(() => {
            mockCatalystClient.getProfile.mockRejectedValue(new Error('Profile fetch failed'))
            mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
          })

          it('should successfully join without membership check and without profile data', async () => {
            const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

            expect(result).toEqual({ connectionUrl: 'test-public-connection-url' })
            expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
            expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
              communityId,
              userAddress,
              CommunityRole.None,
              null
            )
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
          expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
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
})
