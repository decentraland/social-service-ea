import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { AppComponents, CommunityRole } from '../../types'
import { CommunityNotFoundError, CommunityPlaceNotFoundError } from './errors'
import { CommunityPlace, ICommunityPlacesComponent } from './types'
import { EthAddress, PaginatedParameters } from '@dcl/schemas'

export async function createCommunityPlacesComponent(
  components: Pick<AppComponents, 'communitiesDb' | 'communityRoles' | 'placesApi' | 'logs'>
): Promise<ICommunityPlacesComponent> {
  const { communitiesDb, communityRoles, placesApi, logs } = components

  const logger = logs.getLogger('community-places-component')

  const validateOwnership = async (
    placeIds: string[],
    userAddress: EthAddress
  ): Promise<{ ownedPlaces: string[]; notOwnedPlaces: string[]; isValid: boolean }> => {
    if (placeIds.length === 0) {
      return { ownedPlaces: [], notOwnedPlaces: [], isValid: true }
    }

    const uniquePlaceIds = Array.from(new Set(placeIds))
    const places = await placesApi.getPlaces(uniquePlaceIds)

    const splitPlacesByOwnership = places?.reduce(
      (acc, place) => {
        if (place.owner?.toLowerCase() === userAddress.toLowerCase()) {
          acc.ownedPlaces.push(place.id)
        } else {
          acc.notOwnedPlaces.push(place.id)
        }
        return acc
      },
      { ownedPlaces: [] as string[], notOwnedPlaces: [] as string[] }
    )

    const ownedPlaces = splitPlacesByOwnership?.ownedPlaces ?? []
    const notOwnedPlaces = splitPlacesByOwnership?.notOwnedPlaces ?? []
    const isValid = ownedPlaces.length === uniquePlaceIds.length

    logger.info('Places ownership validation', {
      owner: userAddress.toLowerCase(),
      ownedPlaces: ownedPlaces.join(','),
      notOwnedPlaces: notOwnedPlaces.join(','),
      isValid: isValid ? 'true' : 'false'
    })

    if (!isValid) {
      throw new NotAuthorizedError(`The user ${userAddress} doesn't own all the places`)
    }

    return {
      ownedPlaces,
      notOwnedPlaces,
      isValid
    }
  }

  const validateCommunityExists = async (communityId: string): Promise<void> => {
    const communityExists = await communitiesDb.communityExists(communityId)

    if (!communityExists) {
      throw new CommunityNotFoundError(communityId)
    }
  }

  const addPlaces = async (communityId: string, placesOwner: EthAddress, placeIds: string[]): Promise<void> => {
    const places = Array.from(new Set(placeIds)).map((id) => ({
      id,
      communityId,
      addedBy: placesOwner
    }))

    await communitiesDb.addCommunityPlaces(places)
  }

  const validatePlaceExists = async (communityId: string, placeId: string): Promise<void> => {
    const placeExists = await communitiesDb.communityPlaceExists(communityId, placeId)
    if (!placeExists) {
      throw new CommunityPlaceNotFoundError(`Place ${placeId} not found in community ${communityId}`)
    }
  }

  return {
    getPlaces: async (
      communityId: string,
      options: {
        userAddress?: EthAddress
        pagination: PaginatedParameters
      }
    ): Promise<{ places: Pick<CommunityPlace, 'id'>[]; totalPlaces: number }> => {
      const communityExists = await communitiesDb.communityExists(communityId, { onlyPublic: !options.userAddress })

      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const community = await communitiesDb.getCommunity(communityId)
      if (!community) {
        throw new CommunityNotFoundError(communityId)
      }

      const memberRole =
        community.privacy === 'private' && options.userAddress
          ? await communitiesDb.getCommunityMemberRole(communityId, options.userAddress)
          : CommunityRole.None

      if (community.privacy === 'private' && options.userAddress && memberRole === CommunityRole.None) {
        throw new NotAuthorizedError(
          `The user ${options.userAddress} doesn't have permission to get places from community ${communityId}`
        )
      }

      const places = await communitiesDb.getCommunityPlaces(communityId, options.pagination)
      const totalPlaces = await communitiesDb.getCommunityPlacesCount(communityId)

      return { places, totalPlaces }
    },

    validateAndAddPlaces: async (communityId: string, placesOwner: EthAddress, placeIds: string[]): Promise<void> => {
      await validateCommunityExists(communityId)
      await communityRoles.validatePermissionToAddPlacesToCommunity(communityId, placesOwner)
      await validateOwnership(placeIds, placesOwner)
      await addPlaces(communityId, placesOwner, placeIds)
    },

    addPlaces,

    removePlace: async (communityId: string, userAddress: EthAddress, placeId: string): Promise<void> => {
      await validateCommunityExists(communityId)

      await validatePlaceExists(communityId, placeId)

      await communityRoles.validatePermissionToRemovePlacesFromCommunity(communityId, userAddress)

      await communitiesDb.removeCommunityPlace(communityId, placeId)
    },

    updatePlaces: async (communityId: string, userAddress: EthAddress, placeIds: string[]): Promise<void> => {
      await validateCommunityExists(communityId)

      await communityRoles.validatePermissionToUpdatePlaces(communityId, userAddress)

      await communitiesDb.removeCommunityPlacesWithExceptions(communityId, placeIds)

      const newPlaces = placeIds.map((placeId) => ({
        id: placeId,
        communityId,
        addedBy: userAddress.toLowerCase()
      }))
      await communitiesDb.addCommunityPlaces(newPlaces)
    },

    validateOwnership
  }
}
