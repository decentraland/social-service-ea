import { getPaginationParams } from '@dcl/platform-server-commons'
import { CommunityRole, HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { PaginatedResponse } from '@dcl/schemas'
import {
  CommunityWithUserInformation,
  CommunityPublicInformation,
  CommunityOwnerNotFoundError
} from '../../../logic/community'

export async function getCommunitiesHandler(
  context: Pick<
    HandlerContextWithPath<'communities' | 'logs', '/v1/communities'>,
    'components' | 'url' | 'verification'
  >
): Promise<HTTPResponse<PaginatedResponse<CommunityWithUserInformation | CommunityPublicInformation>>> {
  const {
    components: { communities, logs },
    verification,
    url
  } = context
  const logger = logs.getLogger('get-communities-handler')

  logger.info(`Getting communities`)

  const userAddress = verification?.auth.toLowerCase()
  const pagination = getPaginationParams(url.searchParams)
  const search = url.searchParams.get('search')
  const onlyMemberOf = url.searchParams.get('onlyMemberOf')?.toLowerCase() === 'true'
  const onlyWithActiveVoiceChat = url.searchParams.get('onlyWithActiveVoiceChat')?.toLowerCase() === 'true'
  const roles: CommunityRole[] | undefined = url.searchParams
    .getAll('roles')
    ?.map((role) => role as CommunityRole)
    .filter(Boolean)

  try {
    const { communities: communitiesData, total } = userAddress
      ? await communities.getCommunities(userAddress, {
          pagination,
          search,
          onlyMemberOf,
          onlyWithActiveVoiceChat,
          roles: roles?.length > 0 ? roles : undefined
        })
      : await communities.getCommunitiesPublicInformation({ pagination, search, onlyWithActiveVoiceChat })

    return {
      status: 200,
      body: {
        data: {
          results: communitiesData,
          total,
          page: Math.floor(pagination.offset / pagination.limit) + 1,
          pages: Math.ceil(total / pagination.limit),
          limit: pagination.limit
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting communities: ${message}`)

    if (error instanceof CommunityOwnerNotFoundError) {
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
