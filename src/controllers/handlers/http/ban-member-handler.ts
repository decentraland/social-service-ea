import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { EthAddress } from '@dcl/schemas'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityNotFoundError } from '../../../logic/community/errors'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL } from '../../../adapters/pubsub'

export async function banMemberHandler(
  context: Pick<
    HandlerContextWithPath<'communityBans' | 'logs' | 'pubsub', '/v1/communities/:id/members/:memberAddress/bans'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communityBans, logs, pubsub },
    params: { id: communityId, memberAddress },
    verification
  } = context

  const logger = logs.getLogger('ban-member-handler')
  const addressPerformingBan = normalizeAddress(verification!.auth)
  const addressToBan = normalizeAddress(memberAddress)

  try {
    if (!EthAddress.validate(addressToBan)) {
      throw new InvalidRequestError('Invalid member address')
    }

    logger.info(`Banning member ${addressToBan} from community ${communityId}`)

    await communityBans.banMember(communityId, addressPerformingBan, addressToBan)

    // Notify community member disconnection
    await pubsub.publishInChannel(COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL, {
      communityId,
      memberAddress: addressToBan,
      status: ConnectivityStatus.OFFLINE
    })

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error banning member: ${addressToBan} from community: ${communityId}, error: ${message}`)

    if (
      error instanceof InvalidRequestError ||
      error instanceof NotAuthorizedError ||
      error instanceof CommunityNotFoundError
    ) {
      throw error
    }

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}
