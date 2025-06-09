import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../logic/community'
import { errorMessageOrDefault } from '../../utils/errors'
import { EthAddress } from '@dcl/schemas'
import { CommunityRole } from '../../types/entities'

export async function updateMemberRoleHandler(
  context: Pick<
    HandlerContextWithPath<'community' | 'logs', '/v1/communities/:id/members/:address'>,
    'components' | 'params' | 'verification' | 'url'
  >
): Promise<HTTPResponse> {
  const {
    components: { community, logs },
    params: { id: communityId, address: targetAddress },
    verification,
    url
  } = context

  const logger = logs.getLogger('update-member-role-handler')

  try {
    const updaterAddress = verification!.auth.toLowerCase()
    const targetAddressLower = targetAddress.toLowerCase()

    if (!EthAddress.validate(targetAddressLower)) {
      throw new InvalidRequestError(`Invalid address provided`)
    }

    const searchParams = new URLSearchParams(url.search)
    const newRole = searchParams.get('role')

    if (!newRole || !Object.values(CommunityRole).includes(newRole as CommunityRole)) {
      throw new InvalidRequestError(`Invalid role provided. Must be one of: ${Object.values(CommunityRole).join(', ')}`)
    }

    logger.info(`Updating member role in community ${communityId} for member ${targetAddress} to ${newRole}`)

    await community.updateMemberRole(communityId, updaterAddress, targetAddressLower, newRole as CommunityRole)
    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error updating member role in community: ${communityId}, error: ${message}`)

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
