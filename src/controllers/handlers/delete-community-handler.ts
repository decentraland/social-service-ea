import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { messageErrorOrUnknown } from '../../utils/errors'
import { CommunityNotFoundError } from '../../logic/community/errors'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { isOwner } from '../../logic/community'

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
  const logger = logs.getLogger('delete-community-handler')

  logger.info(`Deleting community: ${id}`)

  try {
    const userAddress = verification!.auth.toLowerCase()
    const community = await communitiesDb.getCommunity(id, userAddress)

    if (!community) {
      throw new CommunityNotFoundError(id)
    }

    if (!isOwner(community, userAddress)) {
      throw new NotAuthorizedError("The user doesn't have permission to delete this community")
    }

    await communitiesDb.deleteCommunity(id)

    return {
      status: 204
    }
  } catch (error) {
    const message = messageErrorOrUnknown(error)

    logger.error(`Error deleting community: ${id}, error: ${message}`)

    if (error instanceof CommunityNotFoundError || error instanceof NotAuthorizedError) {
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
