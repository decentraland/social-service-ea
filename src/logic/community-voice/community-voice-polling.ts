import { isErrorWithMessage } from '../../utils/errors'
import { AppComponents } from '../../types'
import { ICommunityVoiceChatCacheComponent } from './community-voice-cache'
import { COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL } from '../../adapters/pubsub'

/**
 * Interface for the community voice chat polling component
 */
export interface ICommunityVoiceChatPollingComponent {
  /**
   * Starts polling for community voice chat status changes
   */
  start(): Promise<void>

  /**
   * Stops polling
   */
  stop(): Promise<void>

  /**
   * Manually checks all active voice chats for status changes
   */
  checkAllVoiceChats(): Promise<void>

  /**
   * Gets polling statistics
   */
  getStats(): {
    totalChecks: number
    endedDetected: number
    errors: number
    lastCheck: number | null
  }
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

  // Polling statistics
  let totalChecks = 0
  let endedDetected = 0
  let errors = 0
  let lastCheck: number | null = null
  let isRunning = false

  /**
   * Checks all active voice chats in the cache for status changes
   */
  async function checkAllVoiceChats(): Promise<void> {
    try {
      totalChecks++
      lastCheck = Date.now()

      const activeChats = await communityVoiceChatCache.getActiveCommunityVoiceChats()

      if (activeChats.length === 0) {
        logger.debug('No active community voice chats to check')
        return
      }

      logger.debug(`Polling ${activeChats.length} active community voice chats for status changes`)

      // Check each active voice chat for status changes
      const checkPromises = activeChats.map(async (cachedChat) => {
        try {
          // Get current status from comms-gatekeeper
          const currentStatus = await commsGatekeeper.getCommunityVoiceChatStatus(cachedChat.communityId)

          // Update cache and detect changes
          const change = await communityVoiceChatCache.updateAndDetectChange(
            cachedChat.communityId,
            currentStatus?.isActive ?? null
          )

          // If voice chat just ended, send notification
          if (change.justEnded && change.cachedChat) {
            await sendEndedNotification(change.cachedChat)
            endedDetected++
          }

          return { success: true, communityId: cachedChat.communityId }
        } catch (error) {
          console.log('error3', error)
          logger.warn(`Error checking voice chat status for community ${cachedChat.communityId}`, {
            error: isErrorWithMessage(error) ? error.message : 'Unknown error'
          })

          // If we get 404 or null response, treat it as the voice chat ended
          if (
            (error && (error as any).message?.includes('404')) ||
            (error && (error as any).message?.includes('not found'))
          ) {
            const change = await communityVoiceChatCache.updateAndDetectChange(cachedChat.communityId, null)
            if (change.justEnded && change.cachedChat) {
              await sendEndedNotification(change.cachedChat)
              endedDetected++
            }
          }

          return { success: false, communityId: cachedChat.communityId, error }
        }
      })

      const results = await Promise.all(checkPromises)

      const successful = results.filter((r) => r.success).length
      const failed = results.filter((r) => !r.success).length

      if (failed > 0) {
        errors += failed
        logger.warn(`Polling completed with ${failed} errors out of ${activeChats.length} checks`, {
          successful,
          failed,
          totalActive: activeChats.length
        })
      } else {
        logger.debug(`Polling completed successfully for ${successful} active voice chats`)
      }
    } catch (error) {
      console.log('error2', error)
      errors++
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
      await pubsub.publishInChannel(COMMUNITY_VOICE_CHAT_UPDATES_CHANNEL, {
        communityId: cachedChat.communityId,
        status: 'ended',
        ended_at: endedAt
      })

      logger.debug(`Community voice chat ended notification sent successfully for community ${cachedChat.communityId}`)
    } catch (error) {
      console.log('error', error)
      logger.error(`Failed to send ended notification for community ${cachedChat.communityId}`, {
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Starts the polling process
   */
  async function start(): Promise<void> {
    if (isRunning) {
      logger.warn('Community voice chat polling is already running')
      return
    }

    isRunning = true
    logger.info('Started community voice chat polling')

    // Initial check
    await checkAllVoiceChats()
  }

  /**
   * Stops the polling process
   */
  async function stop(): Promise<void> {
    if (!isRunning) {
      logger.warn('Community voice chat polling is not running')
      return
    }

    isRunning = false
    logger.info('Stopped community voice chat polling')
  }

  /**
   * Gets polling statistics
   */
  function getStats(): {
    totalChecks: number
    endedDetected: number
    errors: number
    lastCheck: number | null
  } {
    return {
      totalChecks,
      endedDetected,
      errors,
      lastCheck
    }
  }

  return {
    start,
    stop,
    checkAllVoiceChats,
    getStats
  }
}
