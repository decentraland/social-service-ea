import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { parseProfilesToFriends } from '../../../logic/friends'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { GetOnlineFriendsResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function getOnlineFriendsService({
  components: { logs, db, catalystClient, archipelagoStats }
}: RPCServiceContext<'logs' | 'db' | 'catalystClient' | 'archipelagoStats'>) {
  const logger = logs.getLogger('get-online-friends-service')

  return async function (_request: Empty, context: RpcServerContext): Promise<GetOnlineFriendsResponse> {
    const { address: loggedUserAddress } = context

    try {
      const onlineFriends = await archipelagoStats.getPeersFromCache()

      if (onlineFriends.length === 0) {
        return {
          friends: []
        }
      }

      const friends = await db.getOnlineFriends(loggedUserAddress, onlineFriends)
      const profiles = await catalystClient.getProfiles(friends.map((friend) => friend.address))

      return {
        friends: parseProfilesToFriends(profiles)
      }
    } catch (error: any) {
      logger.error(`Error getting online friends: ${error.message}`)
      return {
        friends: []
      }
    }
  }
}
