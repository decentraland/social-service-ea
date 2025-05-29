import type { PaginatedResponse } from '@dcl/schemas'
import type { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { getPaginationParams } from '@dcl/platform-server-commons'

import type { CommunityMember, HandlerContextWithPath, HTTPResponse } from '../../types'
import { getPaginationResultProperties } from '../../utils/pagination'

type Result = PaginatedResponse<Omit<CommunityMember, 'communityId'>> | { error: string }

export async function getCommunityMembersHandler(
  context: HandlerContextWithPath<'logs' | 'communityMembers', '/communities/:communityId/members'> &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse<Result>> {
  const { communityMembers } = context.components

  const communityId = context.params.communityId

  if (!communityId) {
    return {
      status: 400,
      body: {
        error: 'Community ID is required'
      } as Result
    }
  }

  const paginationParams = getPaginationParams(context.url.searchParams)

  const result = await communityMembers.getCommunityMembers(communityId, paginationParams)

  if (!result) {
    return {
      status: 404,
      body: {
        error: 'Community not found'
      } as Result
    }
  }

  const { members, totalMembers } = result

  return {
    status: 200,
    body: {
      results: members,
      total: totalMembers,
      ...getPaginationResultProperties(totalMembers, paginationParams)
    } as Result
  }
}
