import { EthAddress } from '@dcl/schemas'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { FRIENDSHIPS_PER_PAGE } from '../../../adapters/rpc-server/constants'
import {
  GetMutualFriendsPayload,
  PaginatedFriendsProfilesResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { normalizeAddress } from '../../../utils/address'
import { getPage } from '../../../utils/pagination'
import { parseProfilesToFriends } from '../../../logic/friends'
import { InvalidRequestError } from '../../errors/rpc.errors'

export function getMutualFriendsService({ components: { logs, friends } }: RPCServiceContext<'logs' | 'friends'>) {
  const logger = logs.getLogger('get-mutual-friends-service')

  return async function (
    request: GetMutualFriendsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendsProfilesResponse> {
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
        friends: parseProfilesToFriends(friendsProfiles),
        paginationData: {
          total,
          page: getPage(pagination?.limit || FRIENDSHIPS_PER_PAGE, pagination?.offset)
        }
      }
    } catch (error: any) {
      logger.error(`Error getting mutual friends: ${error.message}`, {
        error: error.message,
        stack: error.stack
      })

      return {
        friends: [],
        paginationData: {
          total: 0,
          page: 1
        }
      }
    }
  }
}
