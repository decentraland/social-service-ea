import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath } from '../../types'
import { getPaginationParams } from '@dcl/platform-server-commons'

export async function getCommunityMembersHandler(
  context: HandlerContextWithPath<'logs' | 'communityMembers', '/communities/:communityId/members'> &
    DecentralandSignatureContext<any>
) {
  const { communityMembers } = context.components

  const communityId = context.params.communityId

  if (!communityId) {
    return {
      status: 400,
      body: {
        error: 'Community ID is required'
      }
    }
  }

  const paginationParams = getPaginationParams(context.url.searchParams)

  const result = await communityMembers.getCommunityMembers(communityId, paginationParams)

  if (!result) {
    return {
      status: 404,
      body: {
        error: 'Community not found'
      }
    }
  }

  return {
    status: 200,
    body: result
  }
}
