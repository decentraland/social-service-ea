import { CommunityWithMembersCount, HandlerContextWithPath, HTTPResponse } from '../../types'
import { messageErrorOrUnknown } from '../../utils/errors'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../adapters/errors'
import { toCommunityWithMembersCount } from '../../logic/community'

export async function getCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communitiesDb', '/communities/:id'>,
    'url' | 'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse<CommunityWithMembersCount>> {
  const {
    components: { communitiesDb, logs },
    params: { id },
    verification
  } = context
  const userAddress = verification?.auth.toLowerCase()
  const logger = logs.getLogger('privacy-handler')

  logger.info(`Getting community: ${id}`)

  if (!userAddress) {
    throw new NotAuthorizedError('Unauthorized')
  }

  try {
    const [community, membersCount] = await Promise.all([
      communitiesDb.getCommunity(id, userAddress),
      communitiesDb.getCommunityMembersCount(id)
    ])

    if (!community) {
      throw new CommunityNotFoundError(id)
    }

    return {
      status: 200,
      body: {
        data: toCommunityWithMembersCount(community, membersCount)
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
