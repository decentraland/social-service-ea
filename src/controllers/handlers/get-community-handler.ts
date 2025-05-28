import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { messageErrorOrUnknown } from '../../utils/errors'
import { CommunityResult, fromDBCommunity } from '../../logic/community'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../adapters/errors'

export async function getCommunityHandler(
  context: Pick<HandlerContextWithPath<'logs' | 'communitiesDb', '/communities/:id'>, 'url' | 'components' | 'params'>
): Promise<HTTPResponse<CommunityResult>> {
  const {
    components: { communitiesDb, logs },
    params: { id }
  } = context
  const logger = logs.getLogger('privacy-handler')

  logger.info(`Getting community: ${id}`)

  if (!id) {
    throw new InvalidRequestError('Invalid id')
  }

  try {
    const [community, places, membersCount] = await Promise.all([
      communitiesDb.getCommunity(id),
      communitiesDb.getCommunityPlaces(id),
      communitiesDb.getCommunityMembersCount(id)
    ])

    if (!community) {
      throw new CommunityNotFoundError(id)
    }

    return {
      status: 200,
      body: {
        data: fromDBCommunity(community, places, membersCount)
      }
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
