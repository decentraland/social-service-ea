import { getPaginationParams, InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityRole, HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { PaginatedResponse } from '@dcl/schemas'
import {
  CommunityWithUserInformationAndVoiceChat,
  CommunityPublicInformationWithVoiceChat,
  CommunityOwnerNotFoundError,
  CommunitySearchResult
} from '../../../logic/community'

const MIN_SEARCH_LENGTH_FOR_MINIMAL_RESPONSE = 3
const MAX_LIMIT_FOR_MINIMAL_RESPONSE = 50

type GetCommunitiesResponse = PaginatedResponse<
  | Omit<CommunityWithUserInformationAndVoiceChat, 'isHostingLiveEvent'>
  | Omit<CommunityPublicInformationWithVoiceChat, 'isHostingLiveEvent'>
  | CommunitySearchResult
>

export async function getCommunitiesHandler(
  context: Pick<
    HandlerContextWithPath<'communities' | 'logs', '/v1/communities'>,
    'components' | 'url' | 'verification'
  >
): Promise<HTTPResponse<GetCommunitiesResponse>> {
  const {
    components: { communities, logs },
    verification,
    url
  } = context
  const logger = logs.getLogger('get-communities-handler')

  const userAddress = verification?.auth?.toLowerCase()
  const minimal = url.searchParams.get('minimal')?.toLowerCase() === 'true'
  const pagination = getPaginationParams(url.searchParams)
  const search = url.searchParams.get('search')

  try {
    if (minimal) {
      if (!userAddress) {
        throw new NotAuthorizedError('Authentication required for minimal community search')
      }

      if (!search || search.length < MIN_SEARCH_LENGTH_FOR_MINIMAL_RESPONSE) {
        throw new InvalidRequestError(
          `Search query must be at least ${MIN_SEARCH_LENGTH_FOR_MINIMAL_RESPONSE} characters when using minimal`
        )
      }
    }

    if (minimal) {
      const limit = Math.min(pagination.limit, MAX_LIMIT_FOR_MINIMAL_RESPONSE)

      logger.info('Searching communities with minimal response', {
        userAddress: userAddress!,
        search: search as string,
        limit
      })

      const { communities: communitiesResult, total } = await communities.searchCommunities(search!, {
        userAddress: userAddress!,
        limit,
        offset: pagination.offset
      })

      return {
        status: 200,
        body: {
          data: {
            results: communitiesResult,
            total,
            page: Math.floor(pagination.offset / limit) + 1,
            pages: Math.ceil(total / limit),
            limit
          }
        }
      }
    }

    logger.info(`Getting communities`)

    const onlyMemberOf = url.searchParams.get('onlyMemberOf')?.toLowerCase() === 'true'
    const onlyWithActiveVoiceChat = url.searchParams.get('onlyWithActiveVoiceChat')?.toLowerCase() === 'true'
    const roles: CommunityRole[] = url.searchParams
      .getAll('roles')
      .filter((role) => Object.values(CommunityRole).includes(role as CommunityRole))
      .map((role) => role as CommunityRole)

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

    if (
      error instanceof CommunityOwnerNotFoundError ||
      error instanceof NotAuthorizedError ||
      error instanceof InvalidRequestError
    ) {
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
