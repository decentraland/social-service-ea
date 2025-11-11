import { Event, Events, CommunityStreamingEndedEvent } from '@dcl/schemas'
import { createCommunityStreamingEndedHandler } from '../../../../../src/logic/sqs/handlers/community-streaming-ended-handler'
import { createLogsMockedComponent, mockCommunitiesDB } from '../../../../mocks/components'
import { ILoggerComponent } from '@well-known-components/interfaces/dist/components/logger'
import { ICommunitiesDatabaseComponent } from '../../../../../src/types'

describe('CommunityStreamingEndedHandler', () => {
  let handler: ReturnType<typeof createCommunityStreamingEndedHandler>
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockCommunitiesDb: jest.Mocked<ICommunitiesDatabaseComponent>

  beforeEach(() => {
    mockLogs = createLogsMockedComponent({})
    mockCommunitiesDb = mockCommunitiesDB
    handler = createCommunityStreamingEndedHandler({ logs: mockLogs, communitiesDb: mockCommunitiesDb })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when processing CommunityStreamingEndedEvent with communityId', () => {
    let event: CommunityStreamingEndedEvent

    beforeEach(() => {
      event = {
        type: Events.Type.STREAMING,
        subType: Events.SubType.Streaming.COMMUNITY_STREAMING_ENDED,
        metadata: {
          communityId: 'community-123',
          totalParticipants: 25
        }
      } as CommunityStreamingEndedEvent
      mockCommunitiesDb.updateCommunityRankingMetrics.mockResolvedValue(undefined)
    })

    it('should update community ranking metrics with streams_count and streams_total_participants', async () => {
      await handler.handle(event)

      expect(mockCommunitiesDb.updateCommunityRankingMetrics).toHaveBeenCalledWith('community-123', {
        streams_count: 1,
        streams_total_participants: 25
      })
    })
  })

  describe('and communityId is missing', () => {
    let event: CommunityStreamingEndedEvent

    beforeEach(() => {
      event = {
        type: Events.Type.STREAMING,
        subType: Events.SubType.Streaming.COMMUNITY_STREAMING_ENDED,
        metadata: {
          totalParticipants: 25
        }
      } as CommunityStreamingEndedEvent
    })

    it('should return without updating metrics', async () => {
      await handler.handle(event)

      expect(mockCommunitiesDb.updateCommunityRankingMetrics).not.toHaveBeenCalled()
    })
  })

  describe('and updateCommunityRankingMetrics throws an error', () => {
    let event: CommunityStreamingEndedEvent

    beforeEach(() => {
      event = {
        type: Events.Type.STREAMING,
        subType: Events.SubType.Streaming.COMMUNITY_STREAMING_ENDED,
        metadata: {
          communityId: 'community-123',
          totalParticipants: 25
        }
      } as CommunityStreamingEndedEvent
      mockCommunitiesDb.updateCommunityRankingMetrics.mockRejectedValueOnce(new Error('Database error'))
    })

    it('should throw', async () => {
      await expect(handler.handle(event)).rejects.toThrow('Database error')
    })
  })

  describe('and participants is less than or equal to 1', () => {
    let logger: jest.Mocked<ReturnType<ILoggerComponent['getLogger']>>

    beforeEach(() => {
      logger = mockLogs.getLogger('community-streaming-ended-handler') as jest.Mocked<
        ReturnType<ILoggerComponent['getLogger']>
      >
    })

    describe('and totalParticipants is 0', () => {
      let event: CommunityStreamingEndedEvent

      beforeEach(() => {
        event = {
          type: Events.Type.STREAMING,
          subType: Events.SubType.Streaming.COMMUNITY_STREAMING_ENDED,
          metadata: {
            communityId: 'community-123',
            totalParticipants: 0
          }
        } as CommunityStreamingEndedEvent
      })

      it('should log warning and skip updating metrics', async () => {
        await handler.handle(event)

        expect(logger.warn).toHaveBeenCalledWith(
          'CommunityStreamingEndedEvent for community with id community-123 has no participants other than the streamer, skipping'
        )
        expect(mockCommunitiesDb.updateCommunityRankingMetrics).not.toHaveBeenCalled()
      })
    })

    describe('and totalParticipants is 1', () => {
      let event: CommunityStreamingEndedEvent

      beforeEach(() => {
        event = {
          type: Events.Type.STREAMING,
          subType: Events.SubType.Streaming.COMMUNITY_STREAMING_ENDED,
          metadata: {
            communityId: 'community-123',
            totalParticipants: 1
          }
        } as CommunityStreamingEndedEvent
      })

      it('should log warning and skip updating metrics', async () => {
        await handler.handle(event)

        expect(logger.warn).toHaveBeenCalledWith(
          'CommunityStreamingEndedEvent for community with id community-123 has no participants other than the streamer, skipping'
        )
        expect(mockCommunitiesDb.updateCommunityRankingMetrics).not.toHaveBeenCalled()
      })
    })

    describe('and totalParticipants is missing', () => {
      let event: CommunityStreamingEndedEvent

      beforeEach(() => {
        event = {
          type: Events.Type.STREAMING,
          subType: Events.SubType.Streaming.COMMUNITY_STREAMING_ENDED,
          metadata: {
            communityId: 'community-123'
          }
        } as CommunityStreamingEndedEvent
      })

      it('should log warning and skip updating metrics', async () => {
        await handler.handle(event)

        expect(logger.warn).toHaveBeenCalledWith(
          'CommunityStreamingEndedEvent for community with id community-123 has no participants other than the streamer, skipping'
        )
        expect(mockCommunitiesDb.updateCommunityRankingMetrics).not.toHaveBeenCalled()
      })
    })
  })
})
