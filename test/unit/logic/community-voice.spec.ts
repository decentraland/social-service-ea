import { ILoggerComponent } from '@well-known-components/interfaces'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { createCommunityVoiceComponent } from '../../../src/logic/community-voice'
import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import { CommunityRole, ICommsGatekeeperComponent, IPubSubComponent, ICommunitiesDatabaseComponent, ICatalystClientComponent } from '../../../src/types'
import {
  CommunityVoiceChatNotFoundError,
  CommunityVoiceChatAlreadyActiveError,
  UserNotCommunityMemberError,
  CommunityVoiceChatPermissionError,
  CommunityVoiceChatCreationError
} from '../../../src/logic/community-voice/errors'
import { AnalyticsEvent, AnalyticsEventPayload } from '../../../src/types/analytics'
import { ICommunityVoiceComponent } from '../../../src/logic/community-voice'

describe('Community Voice Logic', () => {
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockCommsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let mockCommunitiesDb: Partial<jest.Mocked<ICommunitiesDatabaseComponent>>
  let mockPubsub: jest.Mocked<IPubSubComponent>
  let mockAnalytics: jest.Mocked<IAnalyticsComponent<AnalyticsEventPayload>>
  let mockCatalystClient: jest.Mocked<ICatalystClientComponent>
  let communityVoice: ICommunityVoiceComponent
  let logger: jest.Mocked<ReturnType<ILoggerComponent['getLogger']>>

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

    mockCommsGatekeeper = {
      getCommunityVoiceChatStatus: jest.fn(),
      createCommunityVoiceChatRoom: jest.fn(),
      getCommunityVoiceChatCredentials: jest.fn(),
      isUserInAVoiceChat: jest.fn(),
      updateUserPrivateMessagePrivacyMetadata: jest.fn(),
      getPrivateVoiceChatCredentials: jest.fn(),
      endPrivateVoiceChat: jest.fn(),
      updateUserMetadataInCommunityVoiceChat: jest.fn(),
      requestToSpeakInCommunityVoiceChat: jest.fn(),
      promoteSpeakerInCommunityVoiceChat: jest.fn(),
      demoteSpeakerInCommunityVoiceChat: jest.fn(),
      kickUserFromCommunityVoiceChat: jest.fn()
    } as jest.Mocked<ICommsGatekeeperComponent>

    mockCommunitiesDb = {
      getCommunityMemberRole: jest.fn(),
      getCommunity: jest.fn()
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

    communityVoice = await createCommunityVoiceComponent({
      logs: mockLogs,
      commsGatekeeper: mockCommsGatekeeper,
      communitiesDb: mockCommunitiesDb as ICommunitiesDatabaseComponent,
      pubsub: mockPubsub,
      analytics: mockAnalytics,
      catalystClient: mockCatalystClient
    })
  })

  describe('startCommunityVoiceChat', () => {
    const communityId = 'test-community-id'
    const creatorAddress = '0x123'

    it('should successfully start a community voice chat for an owner', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Owner)
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ 
        isActive: false, 
        participantCount: 0, 
        moderatorCount: 0 
      })
      mockCatalystClient.getProfile.mockResolvedValue({
        avatars: [{
          name: 'CreatorUser',
          hasClaimedName: true,
          userId: creatorAddress,
          avatar: {
            snapshots: {
              face256: 'https://example.com/creator-face.png'
            }
          }
        }]
      } as any)
      mockCommsGatekeeper.createCommunityVoiceChatRoom.mockResolvedValue({
        connectionUrl: 'test-connection-url'
      })

      // Act
      const result = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress)

      // Assert
      expect(result).toEqual({ connectionUrl: 'test-connection-url' })
      expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, creatorAddress)
      expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
      expect(mockCommsGatekeeper.createCommunityVoiceChatRoom).toHaveBeenCalledWith(
        communityId,
        creatorAddress,
        {
          name: 'CreatorUser',
          hasClaimedName: true,
          profilePictureUrl: 'https://example.com/creator-face.png'
        }
      )
      expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
        communityId,
        status: 'started'
      })
      expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.START_COMMUNITY_CALL, {
        call_id: communityId,
        user_id: creatorAddress
      })
    })

    it('should successfully start a community voice chat for a moderator', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Moderator)
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ 
        isActive: false, 
        participantCount: 0, 
        moderatorCount: 0 
      })
      mockCatalystClient.getProfile.mockResolvedValue({
        avatars: [{
          name: 'ModeratorUser',
          hasClaimedName: false,
          userId: creatorAddress,
          avatar: {
            snapshots: {
              face256: 'https://example.com/moderator-face.png'
            }
          }
        }]
      } as any)
      mockCommsGatekeeper.createCommunityVoiceChatRoom.mockResolvedValue({
        connectionUrl: 'test-connection-url'
      })

      // Act
      const result = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress)

      // Assert
      expect(result).toEqual({ connectionUrl: 'test-connection-url' })
      expect(mockCommsGatekeeper.createCommunityVoiceChatRoom).toHaveBeenCalledWith(
        communityId,
        creatorAddress,
        {
          name: 'ModeratorUser',
          hasClaimedName: false,
          profilePictureUrl: 'https://example.com/moderator-face.png'
        }
      )
    })

    it('should handle profile fetch failure gracefully when starting voice chat', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Owner)
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ 
        isActive: false, 
        participantCount: 0, 
        moderatorCount: 0 
      })
      mockCatalystClient.getProfile.mockRejectedValue(new Error('Profile fetch failed'))
      mockCommsGatekeeper.createCommunityVoiceChatRoom.mockResolvedValue({
        connectionUrl: 'test-connection-url'
      })

      // Act
      const result = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress)

      // Assert
      expect(result).toEqual({ connectionUrl: 'test-connection-url' })
      expect(mockCommsGatekeeper.createCommunityVoiceChatRoom).toHaveBeenCalledWith(
        communityId,
        creatorAddress,
        null
      )
    })

    it('should throw UserNotCommunityMemberError when user is not a member', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.None)

      // Act & Assert
      await expect(communityVoice.startCommunityVoiceChat(communityId, creatorAddress)).rejects.toThrow(
        UserNotCommunityMemberError
      )
    })

    it('should throw CommunityVoiceChatPermissionError when user is only a member', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Member)

      // Act & Assert
      await expect(communityVoice.startCommunityVoiceChat(communityId, creatorAddress)).rejects.toThrow(
        CommunityVoiceChatPermissionError
      )
    })

    it('should throw CommunityVoiceChatAlreadyActiveError when voice chat is already active', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Owner)
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ 
        isActive: true, 
        participantCount: 1, 
        moderatorCount: 1 
      })

      // Act & Assert
      await expect(communityVoice.startCommunityVoiceChat(communityId, creatorAddress)).rejects.toThrow(
        CommunityVoiceChatAlreadyActiveError
      )
    })

    it('should throw CommunityVoiceChatCreationError when creation fails', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Owner)
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ 
        isActive: false, 
        participantCount: 0, 
        moderatorCount: 0 
      })
      mockCommsGatekeeper.createCommunityVoiceChatRoom.mockRejectedValue(new Error('Creation failed'))

      // Act & Assert
      await expect(communityVoice.startCommunityVoiceChat(communityId, creatorAddress)).rejects.toThrow(
        CommunityVoiceChatCreationError
      )
    })
  })

  describe('joinCommunityVoiceChat', () => {
    const communityId = 'test-community-id'
    const userAddress = '0x456'

    it('should successfully join community voice chat as a member', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: true,
        participantCount: 5,
        moderatorCount: 1
      })
      mockCommunitiesDb.getCommunity!.mockResolvedValue({ 
        id: communityId,
        name: 'Test Community',
        description: 'Test Description',
        ownerAddress: '0x123',
        privacy: 'private', // Changed to private so membership is checked
        active: true,
        role: CommunityRole.Member
      })
      mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Member)
      mockCatalystClient.getProfile.mockResolvedValue({
        avatars: [{
          name: 'MemberUser',
          hasClaimedName: true,
          userId: userAddress,
          avatar: {
            snapshots: {
              face256: 'https://example.com/member-face.png'
            }
          }
        }]
      } as any)
      mockCommsGatekeeper.getCommunityVoiceChatCredentials.mockResolvedValue({
        connectionUrl: 'test-connection-url'
      })

      // Act
      const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

      // Assert
      expect(result).toEqual({ connectionUrl: 'test-connection-url' })
      expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
      expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
      expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
      expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
        communityId, 
        userAddress,
        {
          name: 'MemberUser',
          hasClaimedName: true,
          profilePictureUrl: 'https://example.com/member-face.png'
        }
      )
      // No longer expecting publishInChannel for join events
    })

    it('should successfully join public community voice chat without membership check', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: true,
        participantCount: 3,
        moderatorCount: 1
      })
      mockCommunitiesDb.getCommunity!.mockResolvedValue({ 
        id: communityId,
        name: 'Public Test Community',
        description: 'Public community for testing',
        ownerAddress: '0x123',
        privacy: 'public', // Public community - no membership check needed
        active: true,
        role: CommunityRole.None // User is not a member but can still join
      })
      mockCatalystClient.getProfile.mockResolvedValue({
        avatars: [{
          unclaimedName: 'PublicUser#0456',
          hasClaimedName: false,
          userId: userAddress,
          avatar: {
            snapshots: {
              face256: 'https://example.com/public-face.png'
            }
          }
        }]
      } as any)
      mockCommsGatekeeper.getCommunityVoiceChatCredentials.mockResolvedValue({
        connectionUrl: 'test-public-connection-url'
      })

      // Act
      const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

      // Assert
      expect(result).toEqual({ connectionUrl: 'test-public-connection-url' })
      expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
      expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
      expect(mockCommunitiesDb.getCommunityMemberRole).not.toHaveBeenCalled() // Should not check membership for public communities
      expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
        communityId, 
        userAddress,
                 {
           name: 'PublicUser#0456', // Should include suffix for unclaimed name
           hasClaimedName: false,
           profilePictureUrl: 'https://example.com/public-face.png'
         }
      )
    })

    it('should throw UserNotCommunityMemberError when non-member tries to join private community', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: true,
        participantCount: 2,
        moderatorCount: 1
      })
      mockCommunitiesDb.getCommunity!.mockResolvedValue({ 
        id: communityId,
        name: 'Private Test Community',
        description: 'Private community for testing',
        ownerAddress: '0x123',
        privacy: 'private', // Private community - membership check required
        active: true,
        role: CommunityRole.None
      })
      mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.None) // User is not a member

      // Act & Assert
      await expect(communityVoice.joinCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
        UserNotCommunityMemberError
      )
      expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
      expect(mockCommunitiesDb.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
      expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
      expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).not.toHaveBeenCalled()
    })

    it('should throw CommunityVoiceChatNotFoundError when voice chat is not active', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ 
        isActive: false, 
        participantCount: 0, 
        moderatorCount: 0 
      })

      // Act & Assert
      await expect(communityVoice.joinCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
        CommunityVoiceChatNotFoundError
      )
    })

    it('should throw CommunityVoiceChatNotFoundError when community is not found', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ 
        isActive: true, 
        participantCount: 1, 
        moderatorCount: 1 
      })
      mockCommunitiesDb.getCommunity!.mockResolvedValue(null)

      // Act & Assert
      await expect(communityVoice.joinCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
        CommunityVoiceChatNotFoundError
      )
    })

    it('should allow any user to join a public community', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: true,
        participantCount: 5,
        moderatorCount: 1
      })
      mockCommunitiesDb.getCommunity!.mockResolvedValue({
        id: communityId,
        name: 'Public Community',
        description: 'Test Description',
        ownerAddress: '0x123',
        privacy: 'public',
        active: true,
        role: CommunityRole.None // User is not a member
      })
      mockCatalystClient.getProfile.mockResolvedValue({
        avatars: [{
          name: 'TestUser',
          hasClaimedName: true,
          userId: userAddress,
          avatar: {
            snapshots: {
              face256: 'https://example.com/face.png'
            }
          }
        }]
      } as any)
      mockCommsGatekeeper.getCommunityVoiceChatCredentials.mockResolvedValue({
        connectionUrl: 'test-connection-url'
      })

      // Act
      const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

      // Assert
      expect(result).toEqual({ connectionUrl: 'test-connection-url' })
      expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
        communityId,
        userAddress,
        {
          name: 'TestUser',
          hasClaimedName: true,
          profilePictureUrl: 'https://example.com/face.png'
        }
      )
      // Should not check membership role for public communities
      expect(mockCommunitiesDb.getCommunityMemberRole).not.toHaveBeenCalled()
    })

    it('should throw UserNotCommunityMemberError for non-members in private community', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: true,
        participantCount: 5,
        moderatorCount: 1
      })
      mockCommunitiesDb.getCommunity!.mockResolvedValue({
        id: communityId,
        name: 'Private Community',
        description: 'Test Description',
        ownerAddress: '0x123',
        privacy: 'private',
        active: true,
        role: CommunityRole.None
      })
      mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.None)

      // Act & Assert
      await expect(communityVoice.joinCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
        UserNotCommunityMemberError
      )
      expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
    })

    it('should allow members to join private community with profile data', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: true,
        participantCount: 5,
        moderatorCount: 1
      })
      mockCommunitiesDb.getCommunity!.mockResolvedValue({
        id: communityId,
        name: 'Private Community',
        description: 'Test Description',
        ownerAddress: '0x123',
        privacy: 'private',
        active: true,
        role: CommunityRole.Member
      })
      mockCommunitiesDb.getCommunityMemberRole!.mockResolvedValue(CommunityRole.Member)
      mockCatalystClient.getProfile.mockResolvedValue({
        avatars: [{
          name: 'MemberUser',
          hasClaimedName: false,
          userId: userAddress,
          avatar: {
            snapshots: {
              face256: 'https://example.com/member-face.png'
            }
          }
        }]
      } as any)
      mockCommsGatekeeper.getCommunityVoiceChatCredentials.mockResolvedValue({
        connectionUrl: 'test-connection-url'
      })

      // Act
      const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

      // Assert
      expect(result).toEqual({ connectionUrl: 'test-connection-url' })
      expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
        communityId,
        userAddress,
        {
          name: 'MemberUser',
          hasClaimedName: false,
          profilePictureUrl: 'https://example.com/member-face.png'
        }
      )
    })

    it('should handle profile data fetch failure gracefully', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: true,
        participantCount: 5,
        moderatorCount: 1
      })
      mockCommunitiesDb.getCommunity!.mockResolvedValue({
        id: communityId,
        name: 'Public Community',
        description: 'Test Description',
        ownerAddress: '0x123',
        privacy: 'public',
        active: true,
        role: CommunityRole.None
      })
      mockCatalystClient.getProfile.mockRejectedValue(new Error('Profile fetch failed'))
      mockCommsGatekeeper.getCommunityVoiceChatCredentials.mockResolvedValue({
        connectionUrl: 'test-connection-url'
      })

      // Act
      const result = await communityVoice.joinCommunityVoiceChat(communityId, userAddress)

      // Assert
      expect(result).toEqual({ connectionUrl: 'test-connection-url' })
      expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(
        communityId,
        userAddress,
        null
      )
    })
  })





  describe('getCommunityVoiceChat', () => {
    const communityId = 'test-community-id'

    it('should return community voice chat when active', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ 
        isActive: true, 
        participantCount: 1, 
        moderatorCount: 1 
      })

      // Act
      const result = await communityVoice.getCommunityVoiceChat(communityId)

      // Assert
      expect(result).toMatchObject({
        id: communityId,
        community_id: communityId,
        status: 'active'
      })
    })

    it('should return null when voice chat is not active', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ 
        isActive: false, 
        participantCount: 0, 
        moderatorCount: 0 
      })

      // Act
      const result = await communityVoice.getCommunityVoiceChat(communityId)

      // Assert
      expect(result).toBeNull()
    })
  })
})
