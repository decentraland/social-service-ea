import { EthAddress } from '@dcl/schemas'
import { AppComponents } from '../../types'
import { IFriendsComponent } from './types'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

export async function createFriendsComponent(
  components: Pick<AppComponents, 'friendsDb' | 'catalystClient'>
): Promise<IFriendsComponent> {
  const { friendsDb, catalystClient } = components

  return {
    getFriendsProfiles: async (
      userAddress: EthAddress,
      pagination?: Pagination
    ): Promise<{ friendsProfiles: Profile[]; total: number }> => {
      const [friends, total] = await Promise.all([
        friendsDb.getFriends(userAddress, { pagination, onlyActive: true }),
        friendsDb.getFriendsCount(userAddress, { onlyActive: true })
      ])

      const friendsProfiles = await catalystClient.getProfiles(friends.map((friend) => friend.address))

      return {
        friendsProfiles,
        total
      }
    }
  }
}
