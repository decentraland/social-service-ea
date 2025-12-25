import { Event, Events, EventEndedEvent } from '@dcl/schemas'
import { createEventEndedHandler } from '../../../../../src/controllers/handlers/sqs/event-ended-handler'
import { createLogsMockedComponent, mockCommunitiesDB } from '../../../../mocks/components'
import { ILoggerComponent } from '@well-known-components/interfaces/dist/components/logger'
import { ICommunitiesDatabaseComponent } from '../../../../../src/types'

describe('EventEndedHandler', () => {
  let handler: ReturnType<typeof createEventEndedHandler>
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockCommunitiesDb: jest.Mocked<ICommunitiesDatabaseComponent>

  beforeEach(() => {
    mockLogs = createLogsMockedComponent({})
    mockCommunitiesDb = mockCommunitiesDB
    handler = createEventEndedHandler({ logs: mockLogs, communitiesDb: mockCommunitiesDb })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when processing EventEndedEvent with communityId', () => {
    let event: EventEndedEvent

    beforeEach(() => {
      event = {
        type: Events.Type.EVENT,
        subType: Events.SubType.Event.EVENT_ENDED,
        metadata: {
          communityId: 'community-123',
          totalAttendees: 50
        }
      } as EventEndedEvent
      mockCommunitiesDb.updateCommunityRankingMetrics.mockResolvedValue(undefined)
    })

    it('should update community ranking metrics with events_count and events_total_attendees', async () => {
      await handler.handle(event)

      expect(mockCommunitiesDb.updateCommunityRankingMetrics).toHaveBeenCalledWith('community-123', {
        events_count: 1,
        events_total_attendees: 50
      })
    })
  })

  describe('and totalAttendees is zero', () => {
    let event: EventEndedEvent

    beforeEach(() => {
      event = {
        type: Events.Type.EVENT,
        subType: Events.SubType.Event.EVENT_ENDED,
        metadata: {
          communityId: 'community-123',
          totalAttendees: 0
        }
      } as EventEndedEvent
      mockCommunitiesDb.updateCommunityRankingMetrics.mockResolvedValue(undefined)
    })

    it('should update community ranking metrics with only events_count', async () => {
      await handler.handle(event)

      expect(mockCommunitiesDb.updateCommunityRankingMetrics).toHaveBeenCalledWith('community-123', {
        events_count: 1
      })
    })
  })

  describe('and totalAttendees is missing', () => {
    let event: EventEndedEvent

    beforeEach(() => {
      event = {
        type: Events.Type.EVENT,
        subType: Events.SubType.Event.EVENT_ENDED,
        metadata: {
          communityId: 'community-123'
        }
      } as EventEndedEvent
      mockCommunitiesDb.updateCommunityRankingMetrics.mockResolvedValue(undefined)
    })

    it('should update community ranking metrics with only events_count', async () => {
      await handler.handle(event)

      expect(mockCommunitiesDb.updateCommunityRankingMetrics).toHaveBeenCalledWith('community-123', {
        events_count: 1
      })
    })
  })

  describe('and communityId is missing', () => {
    let event: EventEndedEvent

    beforeEach(() => {
      event = {
        type: Events.Type.EVENT,
        subType: Events.SubType.Event.EVENT_ENDED,
        metadata: {
          totalAttendees: 50
        }
      } as EventEndedEvent
    })

    it('should return without updating metrics', async () => {
      await handler.handle(event)

      expect(mockCommunitiesDb.updateCommunityRankingMetrics).not.toHaveBeenCalled()
    })
  })

  describe('and updateCommunityRankingMetrics throws an error', () => {
    let event: EventEndedEvent

    beforeEach(() => {
      event = {
        type: Events.Type.EVENT,
        subType: Events.SubType.Event.EVENT_ENDED,
        metadata: {
          communityId: 'community-123',
          totalAttendees: 50
        }
      } as EventEndedEvent
      mockCommunitiesDb.updateCommunityRankingMetrics.mockRejectedValueOnce(new Error('Database error'))
    })

    it('should throw', async () => {
      await expect(handler.handle(event)).rejects.toThrow('Database error')
    })
  })
})
