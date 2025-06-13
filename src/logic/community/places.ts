import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { AppComponents, CommunityRole } from '../../types'
import { CommunityNotFoundError, CommunityPlaceNotFoundError } from './errors'
import { CommunityPlace, ICommunityPlacesComponent } from './types'
import { EthAddress, PaginatedParameters } from '@dcl/schemas'

export async function createCommunityPlacesComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'communityRoles' | 'logs'>
): Promise<ICommunityPlacesComponent> {
  const { communitiesDb, communityRoles, logs } = components

  const _logger = logs.getLogger('community-places-component')

  return {
    getPlaces: async (
      communityId: string,
      userAddress: EthAddress,
      pagination: PaginatedParameters
    ): Promise<{ places: Pick<CommunityPlace, 'id'>[]; totalPlaces: number }> => {
      const communityExists = await communitiesDb.communityExists(communityId)
      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const memberRole = await communitiesDb.getCommunityMemberRole(communityId, userAddress)
      if (!memberRole || memberRole === CommunityRole.None) {
        throw new NotAuthorizedError("The user doesn't have permission to get places")
      }

      const places = await communitiesDb.getCommunityPlaces(communityId, pagination)
      const totalPlaces = await communitiesDb.getCommunityPlacesCount(communityId)

      return { places, totalPlaces }
    },

    addPlaces: async (communityId: string, userAddress: EthAddress, placeIds: string[]): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)
      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const canAdd = await communityRoles.canAddPlacesToCommunity(communityId, userAddress)
      if (!canAdd) {
        throw new NotAuthorizedError(
          `The user ${userAddress} doesn't have permission to add places to community ${communityId}`
        )
      }

      // TODO: validate that places are owned by the user
      const places = placeIds.map((id) => ({
        id,
        communityId,
        addedBy: userAddress
      }))

      await communitiesDb.addCommunityPlaces(places)
    },

    removePlace: async (communityId: string, userAddress: EthAddress, placeId: string): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)
      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const placeExists = await communitiesDb.communityPlaceExists(communityId, placeId)
      if (!placeExists) {
        throw new CommunityPlaceNotFoundError(`Place ${placeId} not found in community ${communityId}`)
      }

      const canRemove = await communityRoles.canRemovePlacesFromCommunity(communityId, userAddress)
      if (!canRemove) {
        throw new NotAuthorizedError(
          `The user ${userAddress} doesn't have permission to remove places from community ${communityId}`
        )
      }

      await communitiesDb.removeCommunityPlace(communityId, placeId)
    }
  }
}
