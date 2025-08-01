import { isErrorWithMessage } from '../../utils/errors'
import { AppComponents } from '../../types'
import { ICommunityVoiceChatCacheComponent } from './community-voice-cache'
import { CommunityVoiceChatStatus as ProtocolCommunityVoiceChatStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../adapters/pubsub'

/**
 * Interface for the community voice chat polling component
 */
export interface ICommunityVoiceChatPollingComponent {
  /**
   * Manually checks all active voice chats for status changes
   */
  checkAllVoiceChats(): Promise<void>
}

/**
 * Creates a community voice chat polling component that intelligently monitors
 * community voice chat status changes and sends "ended" notifications
 */
export function createCommunityVoiceChatPollingComponent({
  logs,
  commsGatekeeper,
  pubsub,
  communityVoiceChatCache
}: Pick<AppComponents, 'logs' | 'commsGatekeeper' | 'pubsub'> & {
  communityVoiceChatCache: ICommunityVoiceChatCacheComponent
}): ICommunityVoiceChatPollingComponent {
  const logger = logs.getLogger('community-voice-chat-polling')

  /**
   * Checks all active voice chats in the cache for status changes
   */
  async function checkAllVoiceChats(): Promise<void> {
    try {
      const activeChats = await communityVoiceChatCache.getActiveCommunityVoiceChats()

      if (activeChats.length === 0) {
        logger.debug('No active community voice chats to check')
        return
      }

      logger.debug(`Polling ${activeChats.length} active community voice chats for status changes`)

      // Check each active voice chat for status changes
      const checkPromises = activeChats.map(async (cachedChat): Promise<boolean> => {
        try {
          // Get current status from comms-gatekeeper
          const currentStatus = await commsGatekeeper.getCommunityVoiceChatStatus(cachedChat.communityId)

          // Update cache and detect changes
          const justEnded = await communityVoiceChatCache.updateAndDetectChange(
            cachedChat.communityId,
            currentStatus?.isActive ?? null
          )

          // If voice chat just ended, send notification
          if (justEnded) {
            await sendEndedNotification(cachedChat)
          }

          return true
        } catch (error) {
          logger.warn(`Error checking voice chat status for community ${cachedChat.communityId}`, {
            error: isErrorWithMessage(error) ? error.message : 'Unknown error'
          })

          // If we get 404 or not found error, treat it as the voice chat ended
          if (isErrorWithMessage(error) && (error.message.includes('404') || error.message.includes('not found'))) {
            const justEnded = await communityVoiceChatCache.updateAndDetectChange(cachedChat.communityId, null)
            if (justEnded) {
              await sendEndedNotification(cachedChat)
            }
          }

          return false
        }
      })

      const results = await Promise.all(checkPromises)

      const successful = results.filter((success) => success).length
      const failed = results.filter((success) => !success).length

      if (failed > 0) {
        logger.warn(`Polling completed with ${failed} errors out of ${activeChats.length} checks`, {
          successful,
          failed,
          totalActive: activeChats.length
        })
      } else {
        logger.debug(`Polling completed successfully for ${successful} active voice chats`)
      }
    } catch (error) {
      logger.error('Error during community voice chat polling', {
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Sends an "ended" notification for a community voice chat
   */
  async function sendEndedNotification(cachedChat: { communityId: string; createdAt: number }): Promise<void> {
    try {
      const endedAt = Date.now()

      logger.info(`Sending community voice chat ended notification for community ${cachedChat.communityId}`, {
        communityId: cachedChat.communityId,
        startedAt: cachedChat.createdAt,
        endedAt,
        duration: endedAt - cachedChat.createdAt
      })

      // Publish ended event to the same channel as started events
      // Note: For ended events, we don't need positions/community info since user already has context
      await pubsub.publishInChannel(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
        communityId: cachedChat.communityId,
        status: ProtocolCommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_ENDED,
        ended_at: endedAt,
        positions: [], // Empty for ended events
        worlds: [], // Empty for ended events
        communityName: '', // Will be fetched by handler if needed
        communityImage: undefined
      })

      logger.debug(`Community voice chat ended notification sent successfully for community ${cachedChat.communityId}`)
    } catch (error) {
      logger.error(`Failed to send ended notification for community ${cachedChat.communityId}`, {
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  return {
    checkAllVoiceChats
  }
}
