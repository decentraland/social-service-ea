import { InvalidRequestError, NotAuthorizedError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { isValidUUID } from '../../../utils/uuid'
import { CommunityVoiceChatPermissionError } from '../../../logic/community-voice/errors'
import { UpdateCommunityVoiceChatSpeakerRequestBody } from './schemas'

/** Mutes or unmutes a speaker. */
export async function muteCommunityVoiceChatSpeakerHandler(
  context: Pick<
    HandlerContextWithPath<'communityVoice' | 'logs', '/v1/community-voice-chats/:communityId/speakers/:address'>,
    'components' | 'params' | 'request' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communityVoice, logs },
    params: { communityId, address },
    request,
    verification
  } = context

  const logger = logs.getLogger('mute-community-voice-chat-speaker-handler')
  const userAddress = normalizeAddress(verification!.auth)
  const targetAddress = normalizeAddress(address)

  try {
    if (!isValidUUID(communityId)) {
      throw new InvalidRequestError('Invalid communityId')
    }

    if (!EthAddress.validate(targetAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    const { muted }: UpdateCommunityVoiceChatSpeakerRequestBody = await request.json()

    await communityVoice.muteSpeakerInCommunityVoiceChat(communityId, targetAddress, userAddress, muted)

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(
      `Error muting ${targetAddress} in the voice chat of community ${communityId} by ${userAddress}, error: ${message}`
    )

    // A banned user is authenticated but not allowed: 403, not the 401 NotAuthorizedError maps to.
    if (error instanceof NotAuthorizedError) {
      throw new CommunityVoiceChatPermissionError(error.message)
    }

    throw error
  }
}
