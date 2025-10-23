import { getPaginationParams } from '@dcl/platform-server-commons'
import { CommunityRole, HandlerContextWithPath, HTTPResponse } from '../../../types'
import { MemberCommunity } from '../../../logic/community'
import { PaginatedResponse } from '@dcl/schemas'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { errorMessageOrDefault } from '../../../utils/errors'

export async function getManagedCommunitiesHandler(
  context: Pick<
    HandlerContextWithPath<'communities' | 'logs', '/v1/communities/:address/managed'>,
    'components' | 'url' | 'params'
  >
): Promise<HTTPResponse<PaginatedResponse<MemberCommunity>>> {
  const {
    components: { communities },
    params: { address },
    url
  } = context

  try {
    const paginationParams = getPaginationParams(url.searchParams)

    const managedCommunities = await communities.getMemberCommunities(address, {
      pagination: paginationParams,
      roles: [CommunityRole.Owner, CommunityRole.Moderator]
    })

    return {
      status: 200,
      body: {
        data: {
          results: managedCommunities.communities,
          total: managedCommunities.total,
          ...getPaginationResultProperties(managedCommunities.total, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    return {
      status: 500,
      body: {
        message
      }
    }
  }
}
