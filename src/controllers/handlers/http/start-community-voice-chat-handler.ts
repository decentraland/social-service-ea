import { InvalidRequestError } from '@dcl/http-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { isValidUUID } from '../../../utils/uuid'
import { StartCommunityVoiceChatRequestBody } from './schemas'

export async function startCommunityVoiceChatHandler(
  context: Pick<
    HandlerContextWithPath<'communityVoice' | 'logs', '/v1/community-voice-chats'>,
    'components' | 'request' | 'verification'
  >
): Promise<HTTPResponse<{ connectionUrl: string }>> {
  const {
    components: { communityVoice, logs },
    request,
    verification
  } = context

  const logger = logs.getLogger('start-community-voice-chat-handler')
  const userAddress = normalizeAddress(verification!.auth)
  let communityId: string | undefined

  try {
    const body: StartCommunityVoiceChatRequestBody = await request.json()
    communityId = body.communityId

    if (!isValidUUID(communityId)) {
      throw new InvalidRequestError('Invalid communityId')
    }

    const { connectionUrl } = await communityVoice.startCommunityVoiceChat(communityId, userAddress, {
      includeProfile: false
    })

    return {
      status: 201,
      body: {
        data: { connectionUrl }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error starting the voice chat of community ${communityId} by ${userAddress}, error: ${message}`)

    throw error
  }
}
