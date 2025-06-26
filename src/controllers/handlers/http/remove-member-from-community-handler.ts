import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../../logic/community'
import { errorMessageOrDefault } from '../../../utils/errors'
import { EthAddress } from '@dcl/schemas'
import { normalizeAddress } from '../../../utils/address'

export async function removeMemberFromCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'communityMembers' | 'logs', '/v1/communities/:id/members/:memberAddress'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communityMembers, logs },
    params: { id: communityId, memberAddress: memberToRemoveAddress },
    verification
  } = context

  const logger = logs.getLogger('kick-member-handler')
  const removerAddress = normalizeAddress(verification!.auth)
  const normalizedMemberToRemoveAddress = normalizeAddress(memberToRemoveAddress)

  logger.info(`Removing member ${memberToRemoveAddress} from community ${communityId}`)

  try {
    if (!EthAddress.validate(normalizedMemberToRemoveAddress)) {
      throw new InvalidRequestError(`Invalid address to remove ${normalizedMemberToRemoveAddress}`)
    }

    if (removerAddress === normalizedMemberToRemoveAddress) {
      await communityMembers.leaveCommunity(communityId, removerAddress)
    } else {
      await communityMembers.kickMember(communityId, removerAddress, normalizedMemberToRemoveAddress)
    }

    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(
      `Error removing member: ${normalizedMemberToRemoveAddress} from community: ${communityId}, error: ${message}`
    )

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
