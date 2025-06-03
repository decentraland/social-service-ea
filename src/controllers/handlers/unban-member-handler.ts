import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { EthAddress } from '@dcl/schemas'
import { normalizeAddress } from '../../utils/address'
import { errorMessageOrDefault } from '../../utils/errors'
import { CommunityNotFoundError } from '../../logic/community/errors'

export async function unbanMemberHandler(
  context: Pick<
    HandlerContextWithPath<'community' | 'logs', '/v1/communities/:id/members/:memberAddress/bans'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { community, logs },
    params: { id: communityId, memberAddress },
    verification
  } = context

  const logger = logs.getLogger('unban-member-handler')

  const unbanningUserAddress = normalizeAddress(verification!.auth)
  const normalizedUnbannedMemberAddress = normalizeAddress(memberAddress)

  try {
    if (!EthAddress.validate(normalizedUnbannedMemberAddress)) {
      throw new InvalidRequestError('Invalid member address')
    }

    logger.info(`Unbanning member ${normalizedUnbannedMemberAddress} from community ${communityId}`)

    await community.unbanMember(communityId, unbanningUserAddress, normalizedUnbannedMemberAddress)

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(
      `Error unbanning member: ${normalizedUnbannedMemberAddress} from community: ${communityId}, error: ${message}`
    )

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
