import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { AppComponents } from '../../types'
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
    const places = await placesApi.getPlaces(placeIds)

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

    logger.info('Places ownership validation', {
      ownedPlaces: (splitPlacesByOwnership?.ownedPlaces ?? []).join(','),
      notOwnedPlaces: (splitPlacesByOwnership?.notOwnedPlaces ?? []).join(','),
      isValid: splitPlacesByOwnership?.ownedPlaces.length === placeIds.length ? 'true' : 'false'
    })

    return {
      ownedPlaces: splitPlacesByOwnership?.ownedPlaces ?? [],
      notOwnedPlaces: splitPlacesByOwnership?.notOwnedPlaces ?? [],
      isValid: splitPlacesByOwnership?.ownedPlaces.length === placeIds.length
    }
  }

  return {
    getPlaces: async (
      communityId: string,
      pagination: PaginatedParameters
    ): Promise<{ places: Pick<CommunityPlace, 'id'>[]; totalPlaces: number }> => {
      const places = await communitiesDb.getCommunityPlaces(communityId, pagination)
      const totalPlaces = await communitiesDb.getCommunityPlacesCount(communityId)
      return { places, totalPlaces }
    },

    addPlaces: async (communityId: string, placesOwner: EthAddress, placeIds: string[]): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)
      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const canAdd = await communityRoles.canAddPlacesToCommunity(communityId, placesOwner)
      if (!canAdd) {
        throw new NotAuthorizedError(
          `The user ${placesOwner} doesn't have permission to add places to community ${communityId}`
        )
      }

      const { ownedPlaces, notOwnedPlaces, isValid } = await validateOwnership(placeIds, placesOwner)

      if (!isValid) {
        logger.error('Invalid places ownership', {
          ownedPlaces: ownedPlaces.join(','),
          notOwnedPlaces: notOwnedPlaces.join(','),
          communityId: communityId,
          owner: placesOwner.toLowerCase()
        })
        throw new NotAuthorizedError(`The user ${placesOwner} doesn't own all the places`)
      }

      const places = Array.from(new Set(placeIds)).map((id) => ({
        id,
        communityId,
        addedBy: placesOwner
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
    },

    updatePlaces: async (communityId: string, userAddress: EthAddress, placeIds: string[]): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)
      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const canUpdate =
        (await communityRoles.canRemovePlacesFromCommunity(communityId, userAddress)) &&
        (await communityRoles.canAddPlacesToCommunity(communityId, userAddress))
      if (!canUpdate) {
        throw new NotAuthorizedError(
          `The user ${userAddress} doesn't have permission to update places in community ${communityId}`
        )
      }

      const { ownedPlaces, notOwnedPlaces, isValid } = await validateOwnership(placeIds, userAddress)

      if (!isValid) {
        logger.error('Invalid places ownership', {
          ownedPlaces: ownedPlaces.join(','),
          notOwnedPlaces: notOwnedPlaces.join(','),
          communityId: communityId,
          owner: userAddress.toLowerCase()
        })
        throw new NotAuthorizedError(`The user ${userAddress} doesn't own all the places`)
      }

      const existingPlaces = await communitiesDb.getCommunityPlaces(communityId, { limit: 1000, offset: 0 })

      for (const place of existingPlaces) {
        await communitiesDb.removeCommunityPlace(communityId, place.id)
      }

      const newPlaces = placeIds.map((placeId) => ({
        id: placeId,
        communityId,
        addedBy: userAddress.toLowerCase()
      }))
      await communitiesDb.addCommunityPlaces(newPlaces)
    }
  }
}
