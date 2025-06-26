import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../../logic/community'
import { errorMessageOrDefault } from '../../../utils/errors'
import { EthAddress } from '@dcl/schemas'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL } from '../../../adapters/pubsub'

export async function addMemberToCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'communityMembers' | 'logs' | 'pubsub', '/v1/communities/:id/members'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communityMembers, logs, pubsub },
    params: { id: communityId },
    verification
  } = context

  const logger = logs.getLogger('join-community-handler')

  logger.info(`Joining community ${communityId}`)

  try {
    const memberAddress = verification!.auth.toLowerCase()

    if (!EthAddress.validate(memberAddress)) {
      throw new InvalidRequestError(`Invalid address ${memberAddress}`)
    }

    await communityMembers.joinCommunity(communityId, memberAddress)

    await pubsub.publishInChannel(COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL, {
      communityId,
      memberAddress,
      status: ConnectivityStatus.ONLINE
    })

    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error joining community: ${communityId}, error: ${message}`)

    if (
      error instanceof CommunityNotFoundError ||
      error instanceof InvalidRequestError ||
      error instanceof NotAuthorizedError
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
