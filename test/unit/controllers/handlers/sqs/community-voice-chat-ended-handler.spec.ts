import { Events, CommunityStreamingEndedEvent } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces/dist/components/logger'
import { CommunityVoiceChatStatus as ProtocolCommunityVoiceChatStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../../../../src/adapters/pubsub'
import { createCommunityVoiceChatEndedHandler } from '../../../../../src/controllers/handlers/sqs/community-voice-chat-ended-handler'
import {
  CachedCommunityVoiceChat,
  ICommunityVoiceChatCacheComponent
} from '../../../../../src/logic/community-voice/community-voice-cache'
import { IPubSubComponent } from '../../../../../src/types'
import { createLogsMockedComponent, createMockedPubSubComponent } from '../../../../mocks/components'

describe('CommunityVoiceChatEndedHandler', () => {
  const communityId = 'community-123'
  const roomCreatedAt = 1640995200000

  let handler: ReturnType<typeof createCommunityVoiceChatEndedHandler>
  let logs: jest.Mocked<ILoggerComponent>
  let pubsub: jest.Mocked<IPubSubComponent>
  let communityVoiceChatCache: jest.Mocked<ICommunityVoiceChatCacheComponent>
  let event: CommunityStreamingEndedEvent

  beforeEach(() => {
    logs = createLogsMockedComponent({})
    pubsub = createMockedPubSubComponent({})
    communityVoiceChatCache = {
      setCommunityVoiceChat: jest.fn(),
      getCommunityVoiceChat: jest.fn(),
      removeCommunityVoiceChat: jest.fn(),
      takeCommunityVoiceChat: jest.fn()
    }

    event = {
      type: Events.Type.STREAMING,
      subType: Events.SubType.Streaming.COMMUNITY_STREAMING_ENDED,
      key: `community-streaming-ended-${communityId}`,
      timestamp: roomCreatedAt + 60000,
      metadata: {
        communityId,
        totalParticipants: 4
      }
    } as CommunityStreamingEndedEvent

    handler = createCommunityVoiceChatEndedHandler({ logs, pubsub, communityVoiceChatCache })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should subscribe to the community streaming ended events published by comms-gatekeeper', () => {
    expect(handler.type).toBe(Events.Type.STREAMING)
    expect(handler.subTypes).toEqual([Events.SubType.Streaming.COMMUNITY_STREAMING_ENDED])
  })

  describe('when the ended room is the one currently cached', () => {
    let cachedChat: CachedCommunityVoiceChat

    beforeEach(() => {
      cachedChat = {
        communityId,
        createdAt: roomCreatedAt,
        notificationScope: 'all'
      }

      communityVoiceChatCache.getCommunityVoiceChat.mockResolvedValue(cachedChat)
      communityVoiceChatCache.takeCommunityVoiceChat.mockResolvedValue(cachedChat)
    })

    it('should publish an ended update on the community voice chat updates channel', async () => {
      await handler.handle(event)

      expect(pubsub.publishInChannel).toHaveBeenCalledWith(
        COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL,
        expect.objectContaining({
          communityId,
          status: ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_ENDED
        })
      )
    })

    it('should announce the end to the audience the start was announced to', async () => {
      await handler.handle(event)

      expect(pubsub.publishInChannel).toHaveBeenCalledWith(
        COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL,
        expect.objectContaining({ notificationScope: 'all' })
      )
    })

    it('should take the cached room so a redelivered event is not announced twice', async () => {
      await handler.handle(event)

      expect(communityVoiceChatCache.takeCommunityVoiceChat).toHaveBeenCalledWith(communityId)
    })

    describe('and another consumer took the cached room first', () => {
      beforeEach(() => {
        communityVoiceChatCache.takeCommunityVoiceChat.mockResolvedValue(null)
      })

      it('should publish no update', async () => {
        await handler.handle(event)

        expect(pubsub.publishInChannel).not.toHaveBeenCalled()
      })
    })

    describe('and publishing the update fails', () => {
      beforeEach(() => {
        pubsub.publishInChannel.mockRejectedValueOnce(new Error('Redis error'))
      })

      it('should not throw, since the message is not redelivered anyway', async () => {
        await expect(handler.handle(event)).resolves.toBeUndefined()
      })
    })
  })

  describe('when no room is cached for the community', () => {
    beforeEach(() => {
      communityVoiceChatCache.getCommunityVoiceChat.mockResolvedValue(null)
    })

    it('should publish no update', async () => {
      await handler.handle(event)

      expect(pubsub.publishInChannel).not.toHaveBeenCalled()
    })

    it('should not touch the cache', async () => {
      await handler.handle(event)

      expect(communityVoiceChatCache.takeCommunityVoiceChat).not.toHaveBeenCalled()
    })
  })

  describe('when the event is older than the room currently cached', () => {
    beforeEach(() => {
      communityVoiceChatCache.getCommunityVoiceChat.mockResolvedValue({
        communityId,
        createdAt: event.timestamp + 1000,
        notificationScope: 'members'
      })
    })

    it('should publish no update, so a room started after the event survives', async () => {
      await handler.handle(event)

      expect(pubsub.publishInChannel).not.toHaveBeenCalled()
    })

    it('should keep the cached room', async () => {
      await handler.handle(event)

      expect(communityVoiceChatCache.takeCommunityVoiceChat).not.toHaveBeenCalled()
    })
  })

  describe('when the event carries no community id', () => {
    beforeEach(() => {
      event.metadata = { totalParticipants: 4 } as CommunityStreamingEndedEvent['metadata']
    })

    it('should publish no update', async () => {
      await handler.handle(event)

      expect(pubsub.publishInChannel).not.toHaveBeenCalled()
    })
  })
})
