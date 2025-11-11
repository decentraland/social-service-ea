import { Event, Events, EventEndedEvent } from '@dcl/schemas'

import { AppComponents } from '../../../types/system'
import { EventHandler } from '../types'

export function createEventEndedHandler({
  logs,
  communitiesDb
}: Pick<AppComponents, 'logs' | 'communitiesDb'>): EventHandler {
  const logger = logs.getLogger('event-ended-handler')

  return {
    type: Events.Type.EVENT,
    subTypes: [Events.SubType.Event.EVENT_ENDED],
    handle: async (message: Event) => {
      const event = message as EventEndedEvent
      const { metadata } = event

      if (!metadata.communityId) {
        logger.warn('EventEndedEvent has no communityId, skipping')
        return
      }

      const attendees = metadata.totalAttendees || 0

      try {
        await communitiesDb.updateCommunityRankingMetrics(metadata.communityId, {
          events_count: 1,
          ...(attendees > 0 && { events_total_attendees: attendees })
        })
      } catch (error) {
        logger.error('Error updating community ranking metrics', {
          communityId: metadata.communityId,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        throw error
      }
    }
  }
}
