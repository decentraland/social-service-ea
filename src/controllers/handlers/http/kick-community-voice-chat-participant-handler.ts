import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { isValidUUID } from '../../../utils/uuid'
import { kickPlayerFromCommunityVoiceChat } from '../../../logic/community-voice/moderation'

export async function kickCommunityVoiceChatParticipantHandler(
  context: Pick<
    HandlerContextWithPath<
      'commsGatekeeper' | 'communitiesDb' | 'logs',
      '/v1/community-voice-chats/:communityId/participants/:address'
    >,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { commsGatekeeper, communitiesDb, logs },
    params: { communityId, address },
    verification
  } = context

  const logger = logs.getLogger('kick-community-voice-chat-participant-handler')
  const userAddress = normalizeAddress(verification!.auth)
  const targetAddress = normalizeAddress(address)

  try {
    if (!isValidUUID(communityId)) {
      throw new InvalidRequestError('Invalid communityId')
    }

    if (!EthAddress.validate(targetAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    await kickPlayerFromCommunityVoiceChat(
      { commsGatekeeper, communitiesDb, logs },
      communityId,
      userAddress,
      targetAddress
    )

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(
      `Error kicking ${targetAddress} from the voice chat of community ${communityId} by ${userAddress}, error: ${message}`
    )

    throw error
  }
}
