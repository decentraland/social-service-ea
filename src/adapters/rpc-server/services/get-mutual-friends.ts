import { RpcServerContext, RPCServiceContext } from '../../../types'
import { FRIENDSHIPS_PER_PAGE } from '../constants'
import {
  GetMutualFriendsPayload,
  PaginatedFriendsProfilesResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { normalizeAddress } from '../../../utils/address'
import { getPage } from '../../../utils/pagination'
import { parseProfilesToUserProfiles } from '../../../logic/friends'

export function getMutualFriendsService({
  components: { logs, db, catalystClient }
}: RPCServiceContext<'logs' | 'db' | 'catalystClient'>) {
  const logger = logs.getLogger('get-mutual-friends-service')

  return async function (
    request: GetMutualFriendsPayload,
    context: RpcServerContext
  ): Promise<PaginatedFriendsProfilesResponse> {
    try {
      const { address: requester } = context
      const { pagination, user } = request
      const requested = normalizeAddress(user!.address)

      const [mutualFriends, total] = await Promise.all([
        db.getMutualFriends(requester, requested, pagination),
        db.getMutualFriendsCount(requester, requested)
      ])

      const profiles = await catalystClient.getProfiles(mutualFriends.map((friend) => friend.address))

      return {
        friends: parseProfilesToUserProfiles(profiles),
        paginationData: {
          total,
          page: getPage(pagination?.limit || FRIENDSHIPS_PER_PAGE, pagination?.offset)
        }
      }
    } catch (error: any) {
      logger.error(`Error getting mutual friends: ${error.message}`)
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
