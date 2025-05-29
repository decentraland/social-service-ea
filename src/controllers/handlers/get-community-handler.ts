import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { messageErrorOrUnknown } from '../../utils/errors'
import { CommunityNotFoundError, CommunityWithMembersCount, toCommunityWithMembersCount } from '../../logic/community'

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
  const logger = logs.getLogger('get-community-handler')

  logger.info(`Getting community: ${id}`)

  try {
    const userAddress = verification!.auth.toLowerCase()
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
    const message = messageErrorOrUnknown(error)
    logger.error(`Error getting community: ${id}, error: ${message}`)

    if (error instanceof CommunityNotFoundError) {
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
