import { Event, Events, PhotoTakenEvent } from '@dcl/schemas'

import { AppComponents } from '../../../types/system'
import { EventHandler } from '../types'

export function createPhotoTakenHandler({
  logs,
  communitiesDb
}: Pick<AppComponents, 'logs' | 'communitiesDb'>): EventHandler {
  const logger = logs.getLogger('photo-taken-handler')

  return {
    type: Events.Type.CAMERA,
    subTypes: [Events.SubType.Camera.PHOTO_TAKEN],
    handle: async (message: Event) => {
      const event = message as PhotoTakenEvent
      const { metadata } = event

      if (!metadata.placeId) {
        logger.warn('PhotoTakenEvent has no placeId, skipping')
        return
      }

      let communityIds: string[]
      try {
        communityIds = await communitiesDb.getCommunitiesByPlaceId(metadata.placeId)
      } catch (error) {
        logger.error('Error getting communities by placeId', {
          placeId: metadata.placeId,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        return
      }

      if (communityIds.length === 0) {
        logger.debug('No communities found for PhotoTakenEvent', {
          placeId: metadata.placeId
        })
        return
      }

      // Update metrics for each community
      for (const communityId of communityIds) {
        try {
          await communitiesDb.updateCommunityRankingMetrics(communityId, {
            photos_count: 1
          })
        } catch (error) {
          logger.error('Error updating community ranking metrics', {
            communityId,
            placeId: metadata.placeId,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          // Continue processing other communities even if one fails
        }
      }
    }
  }
}
