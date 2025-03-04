import { parseProfilesToFriends } from '../../../logic/friends'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { getPage } from '../../../utils/pagination'
import { FRIENDSHIPS_PER_PAGE } from '../constants'
import {
  GetBlockedUsersPayload,
  GetBlockedUsersResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export function getBlockedUsersService({
  components: { logs, db, catalystClient }
}: RPCServiceContext<'logs' | 'db' | 'catalystClient'>) {
  const logger = logs.getLogger('get-blocked-users-service')

  return async function (request: GetBlockedUsersPayload, context: RpcServerContext): Promise<GetBlockedUsersResponse> {
    const { pagination } = request
    const { address: loggedUserAddress } = context

    try {
      const blockedAddresses = await db.getBlockedUsers(loggedUserAddress)
      const profiles = await catalystClient.getProfiles(blockedAddresses)

      return {
        profiles: parseProfilesToFriends(profiles),
        paginationData: {
          total: blockedAddresses.length,
          page: getPage(pagination?.limit || FRIENDSHIPS_PER_PAGE, pagination?.offset)
        }
      }
    } catch (error: any) {
      logger.error(`Error getting blocked users: ${error.message}`, {
        error: error.message,
        stack: error.stack
      })
      return {
        profiles: [],
        paginationData: {
          total: 0,
          page: 1
        }
      }
    }
  }
}
