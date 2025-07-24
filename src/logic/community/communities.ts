import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { AppComponents, CommunityRole } from '../../types'
import { CommunityNotFoundError } from './errors'
import {
  CommunityWithUserInformation,
  GetCommunitiesOptions,
  GetCommunitiesWithTotal,
  ICommunitiesComponent,
  CommunityPublicInformation,
  AggregatedCommunityWithMemberAndVoiceChatData,
  MemberCommunity,
  Community,
  CommunityUpdates,
  AggregatedCommunity
} from './types'
import {
  isOwner,
  toCommunityWithMembersCount,
  toCommunityResults,
  toPublicCommunity,
  getCommunityThumbnailPath
} from './utils'
import { EthAddress } from '@dcl/schemas'
import { isErrorWithMessage } from '../../utils/errors'

export async function createCommunityComponent(
  components: Pick<
    AppComponents,
    | 'communitiesDb'
    | 'catalystClient'
    | 'communityRoles'
    | 'communityPlaces'
    | 'communityEvents'
    | 'cdnCacheInvalidator'
    | 'communityOwners'
    | 'storage'
    | 'config'
    | 'logs'
    | 'commsGatekeeper'
  >
): Promise<ICommunitiesComponent> {
  const {
    communitiesDb,
    catalystClient,
    communityRoles,
    communityPlaces,
    communityEvents,
    communityOwners,
    cdnCacheInvalidator,
    storage,
    config,
    logs,
    commsGatekeeper
  } = components

  const logger = logs.getLogger('community-component')
  const CDN_URL = await config.requireString('CDN_URL')

  const buildThumbnailUrl = (communityId: string) => {
    return `${CDN_URL}${getCommunityThumbnailPath(communityId)}`
  }

  const getThumbnail = async (communityId: string): Promise<string | undefined> => {
    const thumbnailExists = await storage.exists(`communities/${communityId}/raw-thumbnail.png`)

    if (!thumbnailExists) {
      return undefined
    }

    return buildThumbnailUrl(communityId)
  }

  return {
    getCommunity: async (
      id: string,
      userAddress: EthAddress
    ): Promise<AggregatedCommunityWithMemberAndVoiceChatData> => {
      const [community, membersCount, voiceChatStatus] = await Promise.all([
        communitiesDb.getCommunity(id, userAddress),
        communitiesDb.getCommunityMembersCount(id),
        commsGatekeeper.getCommunityVoiceChatStatus(id)
      ])

      if (!community) {
        throw new CommunityNotFoundError(id)
      }

      const [thumbnail, ownerName, isHostingLiveEvent] = await Promise.all([
        getThumbnail(community.id),
        communityOwners.getOwnerName(community.ownerAddress, community.id),
        communityEvents.isCurrentlyHostingEvents(community.id)
      ])

      if (thumbnail) {
        community.thumbnails = {
          raw: thumbnail
        }
      }

      return toCommunityWithMembersCount({ ...community, ownerName, isHostingLiveEvent }, membersCount, voiceChatStatus)
    },

    getCommunities: async (
      userAddress: string,
      options: GetCommunitiesOptions
    ): Promise<GetCommunitiesWithTotal<CommunityWithUserInformation>> => {
      const [communities, total] = await Promise.all([
        communitiesDb.getCommunities(userAddress, options),
        communitiesDb.getCommunitiesCount(userAddress, options)
      ])

      const communitiesWithThumbnailsAndOwnerNames = await Promise.all(
        communities.map(async (community) => {
          const [thumbnail, ownerName] = await Promise.all([
            getThumbnail(community.id),
            communityOwners.getOwnerName(community.ownerAddress, community.id)
          ])

          const result = { ...community, ownerName }

          if (thumbnail) {
            result.thumbnails = {
              raw: thumbnail
            }
          }

          return result
        })
      )

      // Filter by active voice chat if requested
      let filteredCommunities = communitiesWithThumbnailsAndOwnerNames
      if (options.onlyWithActiveVoiceChat) {
        const voiceChatStatuses = await Promise.all(
          communitiesWithThumbnailsAndOwnerNames.map(async (community) => {
            try {
              const status = await commsGatekeeper.getCommunityVoiceChatStatus(community.id)
              return { communityId: community.id, isActive: status?.isActive ?? false }
            } catch (error) {
              // If we can't get the status, assume it's not active
              logger.warn(`Could not get voice chat status for community ${community.id}`, {
                error: isErrorWithMessage(error) ? error.message : 'Unknown error'
              })
              return { communityId: community.id, isActive: false }
            }
          })
        )

        const activeVoiceChatCommunityIds = new Set(
          voiceChatStatuses.filter((status) => status.isActive).map((status) => status.communityId)
        )

        filteredCommunities = communitiesWithThumbnailsAndOwnerNames.filter((community) =>
          activeVoiceChatCommunityIds.has(community.id)
        )
      }

      const friendsAddresses = Array.from(new Set(filteredCommunities.flatMap((community) => community.friends)))
      const friendsProfiles = await catalystClient.getProfiles(friendsAddresses)

      return {
        communities: toCommunityResults(filteredCommunities, friendsProfiles),
        total: options.onlyWithActiveVoiceChat ? filteredCommunities.length : total
      }
    },

    getCommunitiesPublicInformation: async (
      options: GetCommunitiesOptions
    ): Promise<GetCommunitiesWithTotal<CommunityPublicInformation>> => {
      const { search } = options
      const [communities, total] = await Promise.all([
        communitiesDb.getCommunitiesPublicInformation(options),
        communitiesDb.getPublicCommunitiesCount({ search })
      ])

      const communitiesWithThumbnailsAndOwnerNames = await Promise.all(
        communities.map(async (community) => {
          const [thumbnail, ownerName] = await Promise.all([
            getThumbnail(community.id),
            communityOwners.getOwnerName(community.ownerAddress, community.id)
          ])

          const result = { ...community, ownerName }

          if (thumbnail) {
            result.thumbnails = {
              raw: thumbnail
            }
          }

          return result
        })
      )

      // Filter by active voice chat if requested
      let filteredCommunities = communitiesWithThumbnailsAndOwnerNames
      if (options.onlyWithActiveVoiceChat) {
        const voiceChatStatuses = await Promise.all(
          communitiesWithThumbnailsAndOwnerNames.map(async (community) => {
            try {
              const status = await commsGatekeeper.getCommunityVoiceChatStatus(community.id)
              return { communityId: community.id, isActive: status?.isActive ?? false }
            } catch (error) {
              // If we can't get the status, assume it's not active
              logger.warn(`Could not get voice chat status for community ${community.id}`, {
                error: isErrorWithMessage(error) ? error.message : 'Unknown error'
              })
              return { communityId: community.id, isActive: false }
            }
          })
        )

        const activeVoiceChatCommunityIds = new Set(
          voiceChatStatuses.filter((status) => status.isActive).map((status) => status.communityId)
        )

        filteredCommunities = communitiesWithThumbnailsAndOwnerNames.filter((community) =>
          activeVoiceChatCommunityIds.has(community.id)
        )
      }

      return {
        communities: filteredCommunities.map(toPublicCommunity),
        total: options.onlyWithActiveVoiceChat ? filteredCommunities.length : total
      }
    },

    getMemberCommunities: async (
      memberAddress: string,
      options: Pick<GetCommunitiesOptions, 'pagination'>
    ): Promise<GetCommunitiesWithTotal<MemberCommunity>> => {
      const [communities, total] = await Promise.all([
        communitiesDb.getMemberCommunities(memberAddress, options),
        communitiesDb.getCommunitiesCount(memberAddress, { onlyMemberOf: true })
      ])
      return { communities, total }
    },

    createCommunity: async (
      community: Omit<Community, 'id' | 'active' | 'privacy' | 'thumbnails'>,
      thumbnail?: Buffer,
      placeIds: string[] = []
    ): Promise<AggregatedCommunity> => {
      const ownedNames = await catalystClient.getOwnedNames(community.ownerAddress, {
        pageSize: '1'
      })

      if (ownedNames.length === 0) {
        throw new NotAuthorizedError(`The user ${community.ownerAddress} doesn't have any names`)
      }

      const ownerName: string = await communityOwners.getOwnerName(community.ownerAddress)

      if (placeIds.length > 0) {
        await communityPlaces.validateOwnership(placeIds, community.ownerAddress)
      }

      const newCommunity = await communitiesDb.createCommunity({
        ...community,
        owner_address: community.ownerAddress,
        private: false, // TODO: support private communities
        active: true
      })

      await communitiesDb.addCommunityMember({
        communityId: newCommunity.id,
        memberAddress: community.ownerAddress,
        role: CommunityRole.Owner
      })

      if (placeIds.length > 0) {
        await communityPlaces.addPlaces(newCommunity.id, community.ownerAddress, placeIds)
      }

      logger.info('Community created', {
        communityId: newCommunity.id,
        name: newCommunity.name,
        owner: community.ownerAddress.toLowerCase(),
        amountOfPlacesAssociated: placeIds.length
      })

      if (thumbnail) {
        const thumbnailUrl = await storage.storeFile(thumbnail, `communities/${newCommunity.id}/raw-thumbnail.png`)

        logger.info('Thumbnail stored', { thumbnailUrl, communityId: newCommunity.id, size: thumbnail.length })
        newCommunity.thumbnails = {
          raw: buildThumbnailUrl(newCommunity.id)
        }
      }

      return {
        ...newCommunity,
        isHostingLiveEvent: false,
        ownerName
      }
    },

    deleteCommunity: async (id: string, userAddress: string): Promise<void> => {
      const community = await communitiesDb.getCommunity(id, userAddress)

      if (!community) {
        throw new CommunityNotFoundError(id)
      }

      if (!isOwner(community, userAddress)) {
        throw new NotAuthorizedError("The user doesn't have permission to delete this community")
      }

      await communitiesDb.deleteCommunity(id)
    },

    updateCommunity: async (
      communityId: string,
      userAddress: EthAddress,
      updates: CommunityUpdates
    ): Promise<Community> => {
      const community = await communitiesDb.getCommunity(communityId, userAddress)
      if (!community) {
        throw new CommunityNotFoundError(communityId)
      }

      if (Object.keys(updates).length === 0) {
        return {
          id: community.id,
          name: community.name,
          description: community.description,
          ownerAddress: community.ownerAddress,
          privacy: community.privacy,
          active: community.active
        }
      }

      await communityRoles.validatePermissionToEditCommunity(communityId, userAddress)

      const { placeIds, thumbnailBuffer, ...restUpdates } = updates

      if (placeIds && placeIds.length > 0) {
        const uniquePlaceIds = Array.from(new Set(placeIds))
        const currentPlaces = await communitiesDb.getCommunityPlaces(communityId)
        const placeIdsToValidate = uniquePlaceIds.filter((placeId) => !currentPlaces.some((p) => p.id === placeId))
        await communityPlaces.validateOwnership(placeIdsToValidate, userAddress)
      }

      logger.info('Updating community', {
        communityId,
        userAddress,
        updates: JSON.stringify(restUpdates),
        hasThumbnail: thumbnailBuffer ? 'true' : 'false',
        placeIds: placeIds ? placeIds.length : 0
      })

      const updatedCommunity = await communitiesDb.updateCommunity(communityId, updates)

      if (thumbnailBuffer) {
        const thumbnailUrl = await storage.storeFile(thumbnailBuffer, `communities/${communityId}/raw-thumbnail.png`)
        await cdnCacheInvalidator.invalidateThumbnail(communityId)

        logger.info('Thumbnail updated', {
          thumbnailUrl,
          communityId,
          size: thumbnailBuffer.length
        })

        updatedCommunity.thumbnails = {
          raw: buildThumbnailUrl(communityId)
        }
      }

      // Update places if placeIds is provided (even if empty array to remove all places)
      // If placeIds is undefined, it means nothing changed related to places
      if (placeIds !== undefined) {
        await communityPlaces.updatePlaces(communityId, userAddress, placeIds)

        logger.info('Community places updated', {
          communityId,
          userAddress,
          placeIds: placeIds.length
        })
      }

      logger.info('Community updated successfully', {
        communityId,
        userAddress,
        updatedFields: JSON.stringify(Object.keys(restUpdates)),
        hasThumbnail: thumbnailBuffer ? 'true' : 'false',
        hasPlacesUpdate: placeIds !== undefined ? 'true' : 'false'
      })

      return updatedCommunity
    }
  }
}
