import { getPaginationParams, InvalidRequestError } from '@dcl/http-commons'
import { PaginatedResponse } from '@dcl/schemas'
import { FriendshipRequestResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { parseFriendshipRequestsToFriendshipRequestResponses } from '../../../logic/friends'

const DIRECTIONS = ['received', 'sent'] as const
type FriendshipRequestsDirection = (typeof DIRECTIONS)[number]

function isDirection(value: string | null): value is FriendshipRequestsDirection {
  return DIRECTIONS.includes(value as FriendshipRequestsDirection)
}

export async function getFriendshipRequestsHandler(
  context: Pick<
    HandlerContextWithPath<'friends' | 'logs', '/v1/friendship-requests'>,
    'components' | 'url' | 'verification'
  >
): Promise<HTTPResponse<PaginatedResponse<FriendshipRequestResponse>>> {
  const {
    components: { friends, logs },
    url,
    verification
  } = context

  const logger = logs.getLogger('get-friendship-requests-handler')
  const userAddress = normalizeAddress(verification!.auth)
  const direction = url.searchParams.get('direction')

  try {
    if (!isDirection(direction)) {
      throw new InvalidRequestError(`direction must be one of: ${DIRECTIONS.join(', ')}`)
    }

    const paginationParams = getPaginationParams(url.searchParams)
    const { requests, profiles, total } =
      direction === 'received'
        ? await friends.getPendingFriendshipRequests(userAddress, paginationParams)
        : await friends.getSentFriendshipRequests(userAddress, paginationParams)

    return {
      status: 200,
      body: {
        data: {
          results: parseFriendshipRequestsToFriendshipRequestResponses(requests, profiles),
          total,
          ...getPaginationResultProperties(total, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting ${direction} friendship requests of ${userAddress}, error: ${message}`)

    throw error
  }
}
