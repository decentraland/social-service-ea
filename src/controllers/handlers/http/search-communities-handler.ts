import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'

const MIN_SEARCH_LENGTH = 2
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

type CommunitySearchResult = { id: string; name: string }

type SearchCommunitiesResponse = { communities: CommunitySearchResult[] }

export async function searchCommunitiesHandler(
  context: Pick<
    HandlerContextWithPath<'communitiesDb' | 'logs', '/v1/communities/search'>,
    'components' | 'url' | 'verification'
  >
): Promise<HTTPResponse<SearchCommunitiesResponse>> {
  const {
    components: { communitiesDb, logs },
    verification,
    url
  } = context
  const logger = logs.getLogger('search-communities-handler')

  const userAddress = verification?.auth?.toLowerCase()
  const search = url.searchParams.get('q')
  const limitParam = url.searchParams.get('limit')
  const limit = Math.min(Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT), MAX_LIMIT)

  if (!search || search.length < MIN_SEARCH_LENGTH) {
    return {
      status: 400,
      body: {
        message: `Search query must be at least ${MIN_SEARCH_LENGTH} characters`
      }
    }
  }

  logger.info(`Searching communities with query: ${search}`, { userAddress: userAddress ?? 'anonymous', limit })

  try {
    const communities = await communitiesDb.searchCommunities(search, {
      userAddress,
      limit
    })

    return {
      status: 200,
      body: {
        data: {
          communities
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error searching communities: ${message}`)

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}
