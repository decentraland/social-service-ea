import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { ActiveCommunityVoiceChat } from '../../../logic/community/types'

export interface ActiveCommunityVoiceChatsResponse {
  activeChats: ActiveCommunityVoiceChat[]
  total: number
}

export async function getActiveCommunityVoiceChatsHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communityVoice', '/v1/community-voice-chats/active'>,
    'components' | 'verification'
  > &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse<ActiveCommunityVoiceChatsResponse>> {
  const {
    components: { logs, communityVoice },
    verification
  } = context

  const logger = logs.getLogger('get-active-community-voice-chats-handler')
  const userAddress = verification!.auth.toLowerCase()

  logger.info(`Getting active community voice chats for user ${userAddress}`)

  try {
    // Use the community voice component to get all active voice chats
    const activeChats = await communityVoice.getActiveCommunityVoiceChatsForUser(userAddress)

    logger.info(`Retrieved ${activeChats.length} active community voice chats for user ${userAddress}`)

    return {
      status: 200,
      body: {
        data: {
          activeChats,
          total: activeChats.length
        }
      }
    }
  } catch (error) {
    const errorMessage = errorMessageOrDefault(error)
    logger.error(`Failed to get active community voice chats: ${errorMessage}`)

    return {
      status: 500,
      body: {
        message: errorMessage
      }
    }
  }
}
