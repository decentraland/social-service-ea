import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { EthAddress } from '@dcl/schemas'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityNotFoundError } from '../../../logic/community/errors'

export async function unbanMemberHandler(
  context: Pick<
    HandlerContextWithPath<'communityBans' | 'logs', '/v1/communities/:id/members/:memberAddress/bans'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communityBans, logs },
    params: { id: communityId, memberAddress },
    verification
  } = context

  const logger = logs.getLogger('unban-member-handler')

  const addressPerformingUnban = normalizeAddress(verification!.auth)
  const userAddressToUnban = normalizeAddress(memberAddress)

  try {
    if (!EthAddress.validate(userAddressToUnban)) {
      throw new InvalidRequestError('Invalid member address')
    }

    logger.info(`Unbanning member ${userAddressToUnban} from community ${communityId}`)

    await communityBans.unbanMember(communityId, addressPerformingUnban, userAddressToUnban)

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error unbanning member: ${userAddressToUnban} from community: ${communityId}, error: ${message}`)

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
