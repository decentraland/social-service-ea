import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { isValidUUID } from '../../../utils/uuid'
import { demoteSpeakerInCommunityVoiceChat } from '../../../logic/community-voice/moderation'

/** Demotes a speaker to listener: any speaker can step down, owners and moderators can demote others. */
export async function demoteCommunityVoiceChatSpeakerHandler(
  context: Pick<
    HandlerContextWithPath<
      'commsGatekeeper' | 'communitiesDb' | 'logs',
      '/v1/community-voice-chats/:communityId/speakers/:address'
    >,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { commsGatekeeper, communitiesDb, logs },
    params: { communityId, address },
    verification
  } = context

  const logger = logs.getLogger('demote-community-voice-chat-speaker-handler')
  const userAddress = normalizeAddress(verification!.auth)
  const targetAddress = normalizeAddress(address)

  try {
    if (!isValidUUID(communityId)) {
      throw new InvalidRequestError('Invalid communityId')
    }

    if (!EthAddress.validate(targetAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    await demoteSpeakerInCommunityVoiceChat(
      { commsGatekeeper, communitiesDb, logs },
      communityId,
      userAddress,
      targetAddress
    )

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(
      `Error demoting ${targetAddress} in the voice chat of community ${communityId} by ${userAddress}, error: ${message}`
    )

    throw error
  }
}
