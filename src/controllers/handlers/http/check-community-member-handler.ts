import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'

export async function checkCommunityMemberHandler(
  context: Pick<
    HandlerContextWithPath<'communitiesDb' | 'logs', '/v1/communities/:id/members/:memberAddress'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse<void>> {
  const {
    components: { communitiesDb, logs },
    params
  } = context
  const logger = logs.getLogger('check-community-member-handler')

  const communityId = params.id
  const memberAddress = params.memberAddress

  try {
    const isMember = await communitiesDb.isMemberOfCommunity(communityId, memberAddress)

    if (isMember) {
      return {
        status: 204,
        body: undefined
      }
    }

    return {
      status: 404,
      body: {
        message: 'Member not found in community'
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error checking community membership: ${message}`, { communityId, memberAddress })

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}
