import { Event, Events, CommunityStreamingEndedEvent } from '@dcl/schemas'

import { AppComponents } from '../../../types/system'
import { EventHandler } from './types'

export function createCommunityStreamingEndedHandler({
  logs,
  communitiesDb
}: Pick<AppComponents, 'logs' | 'communitiesDb'>): EventHandler {
  const logger = logs.getLogger('community-streaming-ended-handler')

  return {
    type: Events.Type.STREAMING,
    subTypes: [Events.SubType.Streaming.COMMUNITY_STREAMING_ENDED],
    handle: async (message: Event) => {
      const event = message as CommunityStreamingEndedEvent
      const { metadata } = event

      if (!metadata.communityId) {
        logger.warn('CommunityStreamingEndedEvent has no communityId, skipping')
        return
      }

      const participants = metadata.totalParticipants || 0

      if (participants <= 1) {
        logger.warn(
          `CommunityStreamingEndedEvent for community with id ${metadata.communityId} has no participants other than the streamer, skipping`
        )
        return
      }

      try {
        await communitiesDb.updateCommunityRankingMetrics(metadata.communityId, {
          streams_count: 1,
          ...(participants > 0 && { streams_total_participants: participants })
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
