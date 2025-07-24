import { EthAddress } from '@dcl/schemas'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { FRIENDSHIPS_PER_PAGE } from '../../../adapters/rpc-server/constants'
import {
  GetMutualFriendsPayload,
  GetMutualFriendsResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { normalizeAddress } from '../../../utils/address'
import { getPage } from '../../../utils/pagination'
import { parseProfilesToFriends } from '../../../logic/friends'
import { InvalidRequestError } from '../../errors/rpc.errors'
import { isErrorWithMessage } from '../../../utils/errors'

export function getMutualFriendsV2Service({ components: { logs, friends } }: RPCServiceContext<'logs' | 'friends'>) {
  const logger = logs.getLogger('get-mutual-friends-v2-service')

  return async function (
    request: GetMutualFriendsPayload,
    context: RpcServerContext
  ): Promise<GetMutualFriendsResponse> {
    try {
      const { address: requester } = context
      const { pagination, user } = request

      if (!user?.address) {
        throw new InvalidRequestError('User address is missing in the request payload')
      }

      const requested = normalizeAddress(user.address)

      if (!EthAddress.validate(requested)) {
        throw new InvalidRequestError('Invalid user address in the request payload')
      }

      const { friendsProfiles, total } = await friends.getMutualFriendsProfiles(requester, requested, pagination)

      return {
        response: {
          $case: 'ok',
          ok: {
            friends: parseProfilesToFriends(friendsProfiles),
            paginationData: {
              total,
              page: getPage(pagination?.limit || FRIENDSHIPS_PER_PAGE, pagination?.offset)
            }
          }
        }
      }
    } catch (error: any) {
      logger.error(`Error getting mutual friends: ${error.message}`, {
        error: error.message,
        stack: error.stack
      })

      if (error instanceof InvalidRequestError) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: { message: error.message }
          }
        }
      }

      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {
            message: isErrorWithMessage(error) ? error.message : 'Unknown error'
          }
        }
      }
    }
  }
}
