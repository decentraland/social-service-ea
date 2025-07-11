import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../../logic/community'
import { errorMessageOrDefault } from '../../../utils/errors'
import { EthAddress } from '@dcl/schemas'

export async function addMemberToCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'communityMembers' | 'logs', '/v1/communities/:id/members'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communityMembers, logs },
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
