import { createCommunityVoiceComponent } from '../../../src/logic/community-voice'
import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import { CommunityRole } from '../../../src/types'
import {
  CommunityVoiceChatNotFoundError,
  CommunityVoiceChatAlreadyActiveError,
  UserNotCommunityMemberError,
  CommunityVoiceChatPermissionError,
  CommunityVoiceChatCreationError
} from '../../../src/logic/community-voice/errors'
import { AnalyticsEvent } from '../../../src/types/analytics'

describe('Community Voice Logic', () => {
  let mockLogs: any
  let mockConfig: any
  let mockCommsGatekeeper: any
  let mockCommunitiesDb: any
  let mockPubsub: any
  let mockAnalytics: any
  let communityVoice: any
  let logger: any

  beforeEach(async () => {
    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }

    mockLogs = {
      getLogger: jest.fn().mockReturnValue(logger)
    }

    mockConfig = {}

    mockCommsGatekeeper = {
      getCommunityVoiceChatStatus: jest.fn(),
      createCommunityVoiceChatRoom: jest.fn(),
      getCommunityVoiceChatCredentials: jest.fn()
    }

    mockCommunitiesDb = {
      getCommunityMemberRole: jest.fn(),
      getCommunity: jest.fn()
    }

    mockPubsub = {
      publishInChannel: jest.fn()
    }

    mockAnalytics = {
      fireEvent: jest.fn()
    }

    communityVoice = await createCommunityVoiceComponent({
      logs: mockLogs,
      commsGatekeeper: mockCommsGatekeeper,
      communitiesDb: mockCommunitiesDb,
      pubsub: mockPubsub,
      analytics: mockAnalytics
    })
  })

  describe('startCommunityVoiceChat', () => {
    const communityId = 'test-community-id'
    const creatorAddress = '0x123'

    it('should successfully start a community voice chat for an owner', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: false })
      mockCommsGatekeeper.createCommunityVoiceChatRoom.mockResolvedValue({
        connectionUrl: 'test-connection-url'
      })

      // Act
      const result = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress)

      // Assert
      expect(result).toEqual({ connectionUrl: 'test-connection-url' })
      expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(communityId, creatorAddress)
      expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
      expect(mockCommsGatekeeper.createCommunityVoiceChatRoom).toHaveBeenCalledWith(communityId, creatorAddress)
      expect(mockPubsub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
        communityId,
        status: 'started'
      })
      expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.START_CALL, {
        call_id: communityId,
        user_id: creatorAddress
      })
    })

    it('should successfully start a community voice chat for a moderator', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: false })
      mockCommsGatekeeper.createCommunityVoiceChatRoom.mockResolvedValue({
        connectionUrl: 'test-connection-url'
      })

      // Act
      const result = await communityVoice.startCommunityVoiceChat(communityId, creatorAddress)

      // Assert
      expect(result).toEqual({ connectionUrl: 'test-connection-url' })
    })

    it('should throw UserNotCommunityMemberError when user is not a member', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)

      // Act & Assert
      await expect(communityVoice.startCommunityVoiceChat(communityId, creatorAddress)).rejects.toThrow(
        UserNotCommunityMemberError
      )
    })

    it('should throw CommunityVoiceChatPermissionError when user is only a member', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)

      // Act & Assert
      await expect(communityVoice.startCommunityVoiceChat(communityId, creatorAddress)).rejects.toThrow(
        CommunityVoiceChatPermissionError
      )
    })

    it('should throw CommunityVoiceChatAlreadyActiveError when voice chat is already active', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: true })

      // Act & Assert
      await expect(communityVoice.startCommunityVoiceChat(communityId, creatorAddress)).rejects.toThrow(
        CommunityVoiceChatAlreadyActiveError
      )
    })

    it('should throw CommunityVoiceChatCreationError when creation fails', async () => {
      // Arrange
      mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: false })
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
        participantCount: 5
      })
      mockCommunitiesDb.getCommunity.mockResolvedValue({ id: communityId })
      mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
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
      expect(mockCommsGatekeeper.getCommunityVoiceChatCredentials).toHaveBeenCalledWith(communityId, userAddress)
      // No longer expecting publishInChannel for join events
    })

    it('should throw CommunityVoiceChatNotFoundError when voice chat is not active', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: false })

      // Act & Assert
      await expect(communityVoice.joinCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
        CommunityVoiceChatNotFoundError
      )
    })

    it('should throw UserNotCommunityMemberError when user is not a member', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: true })
      mockCommunitiesDb.getCommunity.mockResolvedValue(null)

      // Act & Assert
      await expect(communityVoice.joinCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
        UserNotCommunityMemberError
      )
    })
  })

  describe('endCommunityVoiceChat', () => {
    const voiceChatId = 'test-community-id'
    const userAddress = '0x789'

    it('should successfully end community voice chat for an owner', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: true })
      mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)

      // Act
      await communityVoice.endCommunityVoiceChat(voiceChatId, userAddress)

      // Assert
      expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(voiceChatId)
      expect(mockCommunitiesDb.getCommunityMemberRole).toHaveBeenCalledWith(voiceChatId, userAddress)
      // No longer expecting publishInChannel for end events
      expect(mockAnalytics.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.END_CALL, {
        call_id: voiceChatId
      })
    })

    it('should throw CommunityVoiceChatNotFoundError when voice chat is not active', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: false })

      // Act & Assert
      await expect(communityVoice.endCommunityVoiceChat(voiceChatId, userAddress)).rejects.toThrow(
        CommunityVoiceChatNotFoundError
      )
    })

    it('should throw CommunityVoiceChatPermissionError when user is only a member', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: true })
      mockCommunitiesDb.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)

      // Act & Assert
      await expect(communityVoice.endCommunityVoiceChat(voiceChatId, userAddress)).rejects.toThrow(
        CommunityVoiceChatPermissionError
      )
    })
  })

  describe('leaveCommunityVoiceChat', () => {
    const voiceChatId = 'test-community-id'
    const userAddress = '0x999'

    it('should successfully leave community voice chat', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: true,
        participantCount: 3
      })

      // Act
      await communityVoice.leaveCommunityVoiceChat(voiceChatId, userAddress)

      // Assert
      expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(voiceChatId)
      // No longer expecting publishInChannel for leave events
    })

    it('should throw CommunityVoiceChatNotFoundError when voice chat is not active', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: false })

      // Act & Assert
      await expect(communityVoice.leaveCommunityVoiceChat(voiceChatId, userAddress)).rejects.toThrow(
        CommunityVoiceChatNotFoundError
      )
    })
  })

  describe('getCommunityVoiceChat', () => {
    const communityId = 'test-community-id'

    it('should return community voice chat when active', async () => {
      // Arrange
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: true })

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
      mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({ isActive: false })

      // Act
      const result = await communityVoice.getCommunityVoiceChat(communityId)

      // Assert
      expect(result).toBeNull()
    })
  })
})
