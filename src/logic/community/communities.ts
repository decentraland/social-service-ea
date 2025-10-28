import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { AppComponents, CommunityRole } from '../../types'
import { CommunityNotFoundError } from './errors'
import { FeatureFlag } from '../../adapters/feature-flags'
import {
  CommunityWithUserInformationAndVoiceChat,
  GetCommunitiesOptions,
  GetCommunitiesWithTotal,
  ICommunitiesComponent,
  CommunityPublicInformationWithVoiceChat,
  AggregatedCommunityWithMemberAndVoiceChatData,
  MemberCommunity,
  Community,
  CommunityUpdates,
  AggregatedCommunity,
  CommunityPrivacyEnum,
  CommunityForModeration,
  CommunityRequestStatus,
  CommunityRequestType
} from './types'
import {
  isOwner,
  toCommunityWithMembersCount,
  toCommunityResultsWithVoiceChat,
  toPublicCommunityWithVoiceChat
} from './utils'
import { isErrorWithMessage } from '../../utils/errors'
import { EthAddress, Events } from '@dcl/schemas'
import { COMMUNITY_DELETED_UPDATES_CHANNEL } from '../../adapters/pubsub'
import { AnalyticsEvent } from '../../types/analytics'

export function createCommunityComponent(
  components: Pick<
    AppComponents,
    | 'communitiesDb'
    | 'catalystClient'
    | 'communityRoles'
    | 'communityPlaces'
    | 'communityEvents'
    | 'cdnCacheInvalidator'
    | 'communityOwners'
    | 'communityBroadcaster'
    | 'communityThumbnail'
    | 'cdnCacheInvalidator'
    | 'commsGatekeeper'
    | 'communityComplianceValidator'
    | 'pubsub'
    | 'featureFlags'
    | 'logs'
    | 'analytics'
  >
): ICommunitiesComponent {
  const {
    communitiesDb,
    catalystClient,
    communityRoles,
    communityPlaces,
    communityEvents,
    communityOwners,
    communityBroadcaster,
    communityThumbnail,
    cdnCacheInvalidator,
    commsGatekeeper,
    communityComplianceValidator,
    pubsub,
    featureFlags,
    logs,
    analytics
  } = components

  const logger = logs.getLogger('community-component')

  /**
   * Helper function to filter communities with active voice chat using batch API
   * Only returns communities with active voice chat that the user has permission to see:
   * - Public communities with active voice chat
   * - Private communities with active voice chat where user is a member
   * @param communities - Array of communities to filter
   * @returns Promise<T[]> - Filtered array containing only communities with active voice chat that user can access
   */
  async function filterCommunitiesWithActiveVoiceChat<
    T extends { id: string; privacy?: CommunityPrivacyEnum; role?: CommunityRole }
  >(communities: T[]): Promise<T[]> {
    if (communities.length === 0) {
      return communities
    }

    try {
      const communitiesWithActiveVoiceChat = await commsGatekeeper.getAllActiveCommunityVoiceChats()
      return communities.filter((community) => {
        const isCommunityVoiceChatActive = !!communitiesWithActiveVoiceChat.find((c) => c.communityId === community.id)

        // If privacy/role info is available, check membership for private communities
        if (community.privacy === CommunityPrivacyEnum.Private && community.role === CommunityRole.None) {
          return false // Private community where user is not a member
        }

        return isCommunityVoiceChatActive
      })
    } catch (error) {
      logger.warn('Error filtering communities by voice chat status', {
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
      return [] // If batch call fails, return empty array for safety
    }
  }

  /**
   * Helper function to get voice chat statuses with error handling
   * @param communityIds - Array of community IDs
   * @returns Promise<Record<string, any>> - Voice chat statuses or empty object if error
   */
  async function getVoiceChatStatuses(communityIds: string[]): Promise<Record<string, any>> {
    try {
      return (await commsGatekeeper.getCommunitiesVoiceChatStatus(communityIds)) || {}
    } catch (error) {
      logger.warn('Error getting voice chat statuses for communities', {
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
      return {}
    }
  }

  return {
    getCommunity: async (
      id: string,
      options: {
        as?: EthAddress
      }
    ): Promise<AggregatedCommunityWithMemberAndVoiceChatData> => {
      const [community, membersCount, voiceChatStatus] = await Promise.all([
        communitiesDb.getCommunity(id, options?.as),
        communitiesDb.getCommunityMembersCount(id),
        commsGatekeeper.getCommunityVoiceChatStatus(id)
      ])

      if (!community) {
        throw new CommunityNotFoundError(id)
      }

      const [ownerName, isHostingLiveEvent] = await Promise.all([
        communityOwners.getOwnerName(community.ownerAddress, community.id),
        communityEvents.isCurrentlyHostingEvents(community.id)
      ])

      return toCommunityWithMembersCount({ ...community, ownerName, isHostingLiveEvent }, membersCount, voiceChatStatus)
    },

    getCommunities: async (
      userAddress: string,
      options: GetCommunitiesOptions
    ): Promise<GetCommunitiesWithTotal<Omit<CommunityWithUserInformationAndVoiceChat, 'isHostingLiveEvent'>>> => {
      const [communities, total] = await Promise.all([
        communitiesDb.getCommunities(userAddress, options),
        communitiesDb.getCommunitiesCount(userAddress, options)
      ])

      const communityOwnersNames = await communityOwners.getOwnersNames(communities.map((c) => c.ownerAddress))

      const communitiesWithOwnerNames = communities.map((community) => ({
        ...community,
        ownerName: communityOwnersNames[community.ownerAddress]
      }))

      // Filter by active voice chat if requested
      const filteredCommunities = options.onlyWithActiveVoiceChat
        ? await filterCommunitiesWithActiveVoiceChat(communitiesWithOwnerNames)
        : communitiesWithOwnerNames

      const friendsAddresses = Array.from(new Set(filteredCommunities.flatMap((community) => community.friends)))

      const [friendsProfiles, voiceChatStatuses] = await Promise.all([
        catalystClient.getProfiles(friendsAddresses),
        getVoiceChatStatuses(filteredCommunities.map((c) => c.id))
      ])

      return {
        communities: toCommunityResultsWithVoiceChat(filteredCommunities, friendsProfiles, voiceChatStatuses),
        total: options.onlyWithActiveVoiceChat ? filteredCommunities.length : total
      }
    },

    getCommunitiesPublicInformation: async (
      options: GetCommunitiesOptions
    ): Promise<GetCommunitiesWithTotal<Omit<CommunityPublicInformationWithVoiceChat, 'isHostingLiveEvent'>>> => {
      const { search } = options
      const [communities, total] = await Promise.all([
        communitiesDb.getCommunitiesPublicInformation(options),
        communitiesDb.getPublicCommunitiesCount({ search })
      ])

      const communityOwnersNames = await communityOwners.getOwnersNames(communities.map((c) => c.ownerAddress))

      const communitiesWithOwnerNames = communities.map((community) => ({
        ...community,
        ownerName: communityOwnersNames[community.ownerAddress]
      }))

      // Filter by active voice chat if requested
      const filteredCommunities = options.onlyWithActiveVoiceChat
        ? await filterCommunitiesWithActiveVoiceChat(communitiesWithOwnerNames)
        : communitiesWithOwnerNames

      const voiceChatStatuses = await getVoiceChatStatuses(filteredCommunities.map((c) => c.id))

      return {
        communities: filteredCommunities.map((community) =>
          toPublicCommunityWithVoiceChat(community, voiceChatStatuses[community.id] || null)
        ),
        total: options.onlyWithActiveVoiceChat ? filteredCommunities.length : total
      }
    },

    getMemberCommunities: async (
      memberAddress: string,
      options: Pick<GetCommunitiesOptions, 'pagination' | 'roles'>
    ): Promise<GetCommunitiesWithTotal<MemberCommunity>> => {
      const [communities, total] = await Promise.all([
        communitiesDb.getMemberCommunities(memberAddress, options),
        communitiesDb.getCommunitiesCount(memberAddress, { onlyMemberOf: true, roles: options.roles })
      ])

      return { communities, total }
    },

    createCommunity: async (
      community: Omit<Community, 'id' | 'active' | 'thumbnails'>,
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

      await communityComplianceValidator.validateCommunityContent({
        name: community.name,
        description: community.description,
        thumbnailBuffer: thumbnail
      })

      const newCommunity = await communitiesDb.createCommunity({
        ...community,
        owner_address: community.ownerAddress,
        private: community.privacy === CommunityPrivacyEnum.Private,
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
        const thumbnailUrl = await communityThumbnail.uploadThumbnail(newCommunity.id, thumbnail)

        logger.info('Thumbnail stored', { thumbnailUrl, communityId: newCommunity.id, size: thumbnail.length })
        newCommunity.thumbnails = {
          raw: communityThumbnail.buildThumbnailUrl(newCommunity.id)
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

      const ownerDeletingOwnedCommunity = isOwner(community, userAddress)

      const globalModerators =
        (await featureFlags.getVariants<string[]>(FeatureFlag.COMMUNITIES_GLOBAL_MODERATORS)) || []

      if (!ownerDeletingOwnedCommunity && !globalModerators.includes(userAddress.toLowerCase())) {
        throw new NotAuthorizedError("The user doesn't have permission to delete this community")
      }

      await communitiesDb.deleteCommunity(id)

      const thumbnailUrl = (await communityThumbnail.getThumbnail(id)) || 'N/A'

      setImmediate(async () => {
        if (ownerDeletingOwnedCommunity) {
          await communityBroadcaster.broadcast({
            type: Events.Type.COMMUNITY,
            subType: Events.SubType.Community.DELETED,
            key: id,
            timestamp: Date.now(),
            metadata: {
              id,
              name: community.name,
              thumbnailUrl
            }
          })
        } else {
          await communityBroadcaster.broadcast({
            type: Events.Type.COMMUNITY,
            subType: Events.SubType.Community.DELETED_CONTENT_VIOLATION,
            key: id,
            timestamp: Date.now(),
            metadata: {
              id,
              name: community.name,
              ownerAddress: community.ownerAddress,
              thumbnailUrl
            }
          })
        }

        await pubsub.publishInChannel(COMMUNITY_DELETED_UPDATES_CHANNEL, {
          communityId: id
        })
      })
    },

    updateCommunity: async (
      communityId: string,
      userAddress: EthAddress,
      updates: CommunityUpdates
    ): Promise<Community> => {
      const existingCommunity = await communitiesDb.getCommunity(communityId, userAddress)
      if (!existingCommunity) {
        throw new CommunityNotFoundError(communityId)
      }

      await communityRoles.validatePermissionToEditCommunity(communityId, userAddress)
      if (updates.name && updates.name.trim() !== existingCommunity.name.trim()) {
        await communityRoles.validatePermissionToEditCommunityName(communityId, userAddress)
      }

      if (Object.keys(updates).length === 0) {
        return {
          id: existingCommunity.id,
          name: existingCommunity.name,
          description: existingCommunity.description,
          ownerAddress: existingCommunity.ownerAddress,
          privacy: existingCommunity.privacy,
          active: existingCommunity.active
        }
      }

      const { placeIds, thumbnailBuffer, ...restUpdates } = updates
      const isUpdatingPrivacy = updates.privacy && updates.privacy !== existingCommunity.privacy

      if (placeIds && placeIds.length > 0) {
        const uniquePlaceIds = Array.from(new Set(placeIds))
        const currentPlaces = await communitiesDb.getCommunityPlaces(communityId)
        const placeIdsToValidate = uniquePlaceIds.filter((placeId) => !currentPlaces.some((p) => p.id === placeId))
        await communityPlaces.validateOwnership(placeIdsToValidate, userAddress)
      }

      if (isUpdatingPrivacy) {
        await communityRoles.validatePermissionToUpdateCommunityPrivacy(communityId, userAddress)
      }

      const nameChanged =
        updates.name && updates.name.toLowerCase().trim() !== existingCommunity.name.toLowerCase().trim()
      const descriptionChanged =
        updates.description &&
        updates.description.toLowerCase().trim() !== existingCommunity.description.toLowerCase().trim()

      if (nameChanged || descriptionChanged || thumbnailBuffer) {
        await communityComplianceValidator.validateCommunityContent({
          name: updates.name,
          description: updates.description,
          thumbnailBuffer
        })
      }

      logger.info('Updating community', {
        communityId,
        userAddress,
        updates: JSON.stringify(restUpdates),
        hasThumbnail: thumbnailBuffer ? 'true' : 'false',
        placeIds: placeIds ? placeIds.length : 0
      })

      const updatedCommunity = await communitiesDb.updateCommunity(communityId, {
        ...updates,
        private: updates?.privacy === CommunityPrivacyEnum.Private || undefined
      })

      if (!!updates.name && updates.name.trim() !== existingCommunity.name.trim()) {
        setImmediate(async () => {
          const eventKeySuffix =
            updates.name!.trim().toLowerCase().replace(/ /g, '-') +
            '-' +
            existingCommunity.name.trim().toLowerCase().replace(/ /g, '-')

          await communityBroadcaster.broadcast({
            type: Events.Type.COMMUNITY,
            subType: Events.SubType.Community.RENAMED,
            key: `${communityId}-${eventKeySuffix}`,
            timestamp: Date.now(),
            metadata: {
              id: communityId,
              oldName: existingCommunity.name,
              newName: updates.name!,
              thumbnailUrl: (await communityThumbnail.getThumbnail(communityId)) || 'N/A'
            }
          })
        })
      }

      if (thumbnailBuffer) {
        const thumbnailUrl = await communityThumbnail.uploadThumbnail(communityId, thumbnailBuffer)
        await cdnCacheInvalidator.invalidateThumbnail(communityId)

        logger.info('Thumbnail updated', {
          thumbnailUrl,
          communityId,
          size: thumbnailBuffer.length
        })

        updatedCommunity.thumbnails = {
          raw: communityThumbnail.buildThumbnailUrl(communityId)
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

      const isUpdatingPrivacyToPublic = isUpdatingPrivacy && updates.privacy === CommunityPrivacyEnum.Public

      const requestsToAccept = isUpdatingPrivacyToPublic
        ? ((await communitiesDb.getCommunityRequests(communityId, {
            status: CommunityRequestStatus.Pending,
            type: CommunityRequestType.RequestToJoin
          })) ?? [])
        : []

      if (requestsToAccept?.length > 0) {
        const requestsAccepted = await communitiesDb.acceptAllRequestsToJoin(communityId)

        analytics.fireEvent(AnalyticsEvent.ACCEPT_ALL_REQUESTS_TO_JOIN, {
          community_id: communityId,
          requests_ids: requestsAccepted ?? []
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
    },

    getCommunityInvites: async (inviter: EthAddress, invitee: EthAddress): Promise<Community[]> => {
      const communities = await communitiesDb.getCommunityInvites(inviter, invitee)

      return communities.map((community) => ({
        id: community.id,
        name: community.name,
        description: community.description,
        ownerAddress: community.ownerAddress,
        privacy: community.privacy,
        active: community.active
      }))
    },

    getAllCommunitiesForModeration: async (
      options: GetCommunitiesOptions
    ): Promise<GetCommunitiesWithTotal<CommunityForModeration>> => {
      const [communities, total] = await Promise.all([
        communitiesDb.getAllCommunitiesForModeration(options),
        communitiesDb.getAllCommunitiesForModerationCount({ search: options.search })
      ])

      return { communities, total }
    }
  }
}
