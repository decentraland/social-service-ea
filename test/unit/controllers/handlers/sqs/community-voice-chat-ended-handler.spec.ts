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

      communityVoiceChatCache.takeCommunityVoiceChat.mockResolvedValue(cachedChat)
      pubsub.publishInChannel.mockResolvedValue(true)
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

    // A room started after this end must survive it, and a redelivered event must be announced once.
    it('should take the cached room bounded by the time the end happened', async () => {
      await handler.handle(event)

      expect(communityVoiceChatCache.takeCommunityVoiceChat).toHaveBeenCalledWith(communityId, event.timestamp)
    })

    describe('and publishing the update fails once', () => {
      beforeEach(() => {
        pubsub.publishInChannel.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      })

      it('should publish it again', async () => {
        await handler.handle(event)

        expect(pubsub.publishInChannel).toHaveBeenCalledTimes(2)
      })

      it('should not put the room back in the cache', async () => {
        await handler.handle(event)

        expect(communityVoiceChatCache.setCommunityVoiceChat).not.toHaveBeenCalled()
      })
    })

    describe('and publishing the update keeps failing', () => {
      beforeEach(() => {
        pubsub.publishInChannel.mockResolvedValue(false)
        communityVoiceChatCache.setCommunityVoiceChat.mockResolvedValue(undefined)
      })

      it('should stop after three attempts', async () => {
        await handler.handle(event)

        expect(pubsub.publishInChannel).toHaveBeenCalledTimes(3)
      })

      it('should put the room back in the cache so a redelivery can announce it', async () => {
        await handler.handle(event)

        expect(communityVoiceChatCache.setCommunityVoiceChat).toHaveBeenCalledWith(communityId, roomCreatedAt, 'all')
      })
    })
  })

  describe('when no room is cached for the community, or the cached one started after the event', () => {
    beforeEach(() => {
      communityVoiceChatCache.takeCommunityVoiceChat.mockResolvedValue(null)
    })

    it('should publish no update', async () => {
      await handler.handle(event)

      expect(pubsub.publishInChannel).not.toHaveBeenCalled()
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

    it('should not touch the cache', async () => {
      await handler.handle(event)

      expect(communityVoiceChatCache.takeCommunityVoiceChat).not.toHaveBeenCalled()
    })
  })
})
