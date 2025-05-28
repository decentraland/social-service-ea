import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { messageErrorOrUnknown } from '../../utils/errors'
import { CommunityNotFoundError } from '../../adapters/errors'
import { NotAuthorizedError } from '@dcl/platform-server-commons'

export async function deleteCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'communitiesDb' | 'logs', '/communities/:id'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communitiesDb, logs },
    params: { id },
    verification
  } = context
  const logger = logs.getLogger('privacy-handler')
  logger.info(`Deleting community: ${id}`)

  const userAddress = verification?.auth.toLowerCase()

  if (!userAddress) {
    throw new NotAuthorizedError('Unauthorized')
  }

  try {
    const community = await communitiesDb.getCommunity(id, userAddress)

    if (community.ownerAddress.toLowerCase() !== userAddress) {
      throw new NotAuthorizedError("The user doesn't have permission to delete this community")
    }

    await communitiesDb.deleteCommunity(id)

    return {
      status: 204
    }
  } catch (error) {
    logger.error(`Error getting community: ${id}, error: ${messageErrorOrUnknown(error)}`)

    if (error instanceof CommunityNotFoundError) {
      throw error
    }

    if (error instanceof NotAuthorizedError) {
      throw error
    }

    return {
      status: 500,
      body: {
        message: messageErrorOrUnknown(error)
      }
    }
  }
}
