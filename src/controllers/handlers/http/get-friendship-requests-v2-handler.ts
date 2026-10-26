import { getPaginationParams, InvalidRequestError } from '@dcl/http-commons'
import { PaginatedResponse } from '@dcl/schemas'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { getPaginationResultProperties } from '../../../utils/pagination'
import { FriendshipRequestWithoutProfile, parseFriendshipRequestWithoutProfile } from '../../../logic/friends'

const DIRECTIONS = ['received', 'sent'] as const
type FriendshipRequestsDirection = (typeof DIRECTIONS)[number]

function isDirection(value: string | null): value is FriendshipRequestsDirection {
  return DIRECTIONS.includes(value as FriendshipRequestsDirection)
}

/**
 * Returns the caller's pending friendship requests, received or sent, with the other user's address
 * instead of their profile.
 */
export async function getFriendshipRequestsV2Handler(
  context: Pick<
    HandlerContextWithPath<'friends' | 'logs', '/v2/friendship-requests'>,
    'components' | 'url' | 'verification'
  >
): Promise<HTTPResponse<PaginatedResponse<FriendshipRequestWithoutProfile>>> {
  const {
    components: { friends, logs },
    url,
    verification
  } = context

  const logger = logs.getLogger('get-friendship-requests-v2-handler')
  const userAddress = normalizeAddress(verification!.auth)
  const direction = url.searchParams.get('direction')

  try {
    if (!isDirection(direction)) {
      throw new InvalidRequestError(`direction must be one of: ${DIRECTIONS.join(', ')}`)
    }

    const paginationParams = getPaginationParams(url.searchParams)
    const { requests, total } =
      direction === 'received'
        ? await friends.getPendingFriendshipRequestsWithoutProfiles(userAddress, paginationParams)
        : await friends.getSentFriendshipRequestsWithoutProfiles(userAddress, paginationParams)

    return {
      status: 200,
      body: {
        data: {
          results: requests.map(parseFriendshipRequestWithoutProfile),
          total,
          ...getPaginationResultProperties(total, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting ${direction ?? 'unknown'} friendship requests of ${userAddress}, error: ${message}`)

    throw error
  }
}
