import { getPaginationParams, InvalidRequestError } from '@dcl/http-commons'
import { EthAddress, PaginatedResponse } from '@dcl/schemas'
import { HandlerContextWithPath, HTTPResponse, User } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { getPaginationResultProperties } from '../../../utils/pagination'

/**
 * Returns the friends the caller and `:address` have in common, as addresses only.
 */
export async function getMutualFriendsV2Handler(
  context: Pick<
    HandlerContextWithPath<'friends' | 'logs', '/v2/users/:address/mutual-friends'>,
    'components' | 'url' | 'params' | 'verification'
  >
): Promise<HTTPResponse<PaginatedResponse<User>>> {
  const {
    components: { friends, logs },
    url,
    params,
    verification
  } = context

  const logger = logs.getLogger('get-mutual-friends-v2-handler')
  const userAddress = normalizeAddress(verification!.auth)
  const otherAddress = normalizeAddress(params.address)

  try {
    if (!EthAddress.validate(otherAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    const paginationParams = getPaginationParams(url.searchParams)
    const { friends: results, total } = await friends.getMutualFriendsWithoutProfiles(
      userAddress,
      otherAddress,
      paginationParams
    )

    return {
      status: 200,
      body: {
        data: {
          results,
          total,
          ...getPaginationResultProperties(total, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting mutual friends of ${userAddress} and ${otherAddress}, error: ${message}`)

    throw error
  }
}
