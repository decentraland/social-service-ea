import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../types'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../logic/community'
import { errorMessageOrDefault } from '../../utils/errors'
import { EthAddress } from '@dcl/schemas'

export async function kickMemberHandler(
  context: Pick<
    HandlerContextWithPath<'community' | 'logs', '/v1/communities/:id/members/:memberAddress'>,
    'components' | 'params' | 'verification'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { community, logs },
    params: { id: communityId, memberAddress: memberToKickAddress },
    verification
  } = context

  const logger = logs.getLogger('kick-member-handler')
  const kickerAddress = verification!.auth.toLowerCase()

  logger.info(`Removing member ${memberToKickAddress} from community ${communityId}`)

  try {
    if (!EthAddress.validate(memberToKickAddress)) {
      throw new InvalidRequestError(`Invalid address to remove ${memberToKickAddress}`)
    }

    // If the user is removing themselves, it's a leave operation
    if (kickerAddress.toLowerCase() === memberToKickAddress.toLowerCase()) {
      await community.leaveCommunity(communityId, kickerAddress)
    } else {
      // Otherwise it's a kick operation
      await community.kickMember(communityId, kickerAddress, memberToKickAddress)
    }

    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error removing member: ${memberToKickAddress} from community: ${communityId}, error: ${message}`)

    if (
      error instanceof CommunityNotFoundError ||
      error instanceof NotAuthorizedError ||
      error instanceof InvalidRequestError
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
