import { InvalidRequestError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { messageErrorOrUnknown } from '../../utils/errors'
import { CommunityNotFoundError } from '../../adapters/errors'

export async function deleteCommunityHandler(
  context: Pick<HandlerContextWithPath<'communitiesDb' | 'logs', '/communities/:id'>, 'components' | 'params'>
): Promise<HTTPResponse> {
  const {
    components: { communitiesDb, logs },
    params: { id }
  } = context
  const logger = logs.getLogger('privacy-handler')

  logger.info(`Deleting community: ${id}`)

  if (!id) {
    throw new InvalidRequestError('Invalid id')
  }

  try {
    await communitiesDb.deleteCommunity(id)

    return {
      status: 204
    }
  } catch (error) {
    logger.error(`Error getting community: ${id}, error: ${messageErrorOrUnknown(error)}`)

    if (error instanceof CommunityNotFoundError) {
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
