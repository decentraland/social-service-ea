import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { AppComponents, CommunityRole } from '../../types'
import { CommunityNotFoundError } from './errors'
import {
  CommunityMemberProfile,
  GetCommunityMembersOptions,
  ICommunityMembersComponent,
  CommunityPrivacyEnum
} from './types'
import { mapMembersWithProfiles } from './utils'
import { EthAddress, Events } from '@dcl/schemas'
import { COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL } from '../../adapters/pubsub'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

export async function createCommunityMembersComponent(
  components: Pick<
    AppComponents,
    | 'communitiesDb'
    | 'catalystClient'
    | 'communityRoles'
    | 'communityThumbnail'
    | 'communityBroadcaster'
    | 'logs'
    | 'peersStats'
    | 'pubsub'
  >
): Promise<ICommunityMembersComponent> {
  const {
    communitiesDb,
    catalystClient,
    communityRoles,
    communityThumbnail,
    communityBroadcaster,
    logs,
    peersStats,
    pubsub
  } = components

  const logger = logs.getLogger('community-component')

  const aggregateWithProfiles = async <T extends { memberAddress: EthAddress }>(
    userAddress: EthAddress | undefined,
    members: T[]
  ): Promise<(T & CommunityMemberProfile)[]> => {
    if (members.length === 0) {
      return []
    }

    const profiles = await catalystClient.getProfiles(members.map((member) => member.memberAddress))

    const membersWithProfile = mapMembersWithProfiles<T, T & CommunityMemberProfile>(userAddress, members, profiles)

    return membersWithProfile
  }

  const filterAndCountCommunityMembers = async (id: string, options: GetCommunityMembersOptions) => {
    const { pagination, onlyOnline, as: userAddress, byPassPrivacy } = options
    const communityExists = await communitiesDb.communityExists(id, { onlyPublic: !userAddress && !byPassPrivacy })

    if (!communityExists) {
      throw new CommunityNotFoundError(id)
    }

    const community = await communitiesDb.getCommunity(id)
    if (!community) {
      throw new CommunityNotFoundError(id)
    }

    const memberRole = userAddress ? await communitiesDb.getCommunityMemberRole(id, userAddress) : CommunityRole.None

    if (
      community.privacy === CommunityPrivacyEnum.Private &&
      userAddress &&
      memberRole === CommunityRole.None &&
      !byPassPrivacy
    ) {
      throw new NotAuthorizedError("The user doesn't have permission to get community members")
    }

    let onlinePeers: string[] | undefined = undefined

    if (onlyOnline) {
      onlinePeers = await peersStats.getConnectedPeers()
      logger.info(`Getting community members for community using the ${onlinePeers.length} connected peers`)
    }

    const communityMembers = await communitiesDb.getCommunityMembers(id, {
      userAddress,
      pagination,
      filterByMembers: onlinePeers
    })
    const totalMembers = await communitiesDb.getCommunityMembersCount(id, { filterByMembers: onlinePeers })

    const membersWithProfile = await aggregateWithProfiles(userAddress, communityMembers)

    return { members: membersWithProfile, totalMembers }
  }

  return {
    getCommunityMembers: async (
      id: string,
      options: GetCommunityMembersOptions
    ): Promise<{ members: CommunityMemberProfile[]; totalMembers: number }> => {
      return filterAndCountCommunityMembers(id, options)
    },

    async *getOnlineMembersFromCommunity(
      id: string,
      onlineUsers: EthAddress[],
      batchSize: number = 100
    ): AsyncGenerator<Array<{ memberAddress: string }>> {
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const batch = await communitiesDb.getCommunityMembers(id, {
          pagination: { limit: batchSize, offset },
          filterByMembers: onlineUsers
        })

        if (batch.length === 0) break

        yield batch.map(({ memberAddress }) => ({ memberAddress }))
        offset += batchSize
        hasMore = batch.length === batchSize
      }
    },

    async *getOnlineMembersFromUserCommunities(
      userAddress: string,
      onlineUsers: string[],
      batchSize: number = 100
    ): AsyncGenerator<Array<{ communityId: string; memberAddress: string }>> {
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const batch = await communitiesDb.getOnlineMembersFromUserCommunities(userAddress, onlineUsers, {
          limit: batchSize,
          offset
        })

        if (batch.length === 0) break

        yield batch
        offset += batchSize
        hasMore = batch.length === batchSize
      }
    },

    kickMember: async (communityId: string, kickerAddress: EthAddress, targetAddress: EthAddress): Promise<void> => {
      const community = await communitiesDb.getCommunity(communityId)

      if (!community) {
        throw new CommunityNotFoundError(communityId)
      }

      const doesTargetUserBelongsToCommunity = await communitiesDb.isMemberOfCommunity(communityId, targetAddress)

      if (!doesTargetUserBelongsToCommunity) {
        logger.info(`Target ${targetAddress} is not a member of community ${communityId}, returning 204`)
        return
      }

      await communityRoles.validatePermissionToKickMemberFromCommunity(communityId, kickerAddress, targetAddress)

      await communitiesDb.kickMemberFromCommunity(communityId, targetAddress)

      await pubsub.publishInChannel(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
        communityId,
        memberAddress: targetAddress,
        status: ConnectivityStatus.OFFLINE
      })

      setImmediate(async () => {
        const timestamp = Date.now()
        await communityBroadcaster.broadcast({
          type: Events.Type.COMMUNITY,
          subType: Events.SubType.Community.MEMBER_REMOVED,
          key: `${communityId}-${targetAddress}-${timestamp}`,
          timestamp,
          metadata: {
            id: communityId,
            name: community.name,
            memberAddress: targetAddress,
            thumbnailUrl: communityThumbnail.buildThumbnailUrl(communityId)
          }
        })
      })
    },

    joinCommunity: async (communityId: string, memberAddress: EthAddress): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)

      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const isAlreadyMember = await communitiesDb.isMemberOfCommunity(communityId, memberAddress)

      if (isAlreadyMember) {
        logger.info(`User ${memberAddress} is already a member of community ${communityId}, returning 204`)
        return
      }

      const isBanned = await communitiesDb.isMemberBanned(communityId, memberAddress)

      if (isBanned) {
        throw new NotAuthorizedError(`The user ${memberAddress} is banned from community ${communityId}`)
      }

      await communitiesDb.addCommunityMember({
        communityId,
        memberAddress,
        role: CommunityRole.Member
      })

      await pubsub.publishInChannel(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
        communityId,
        memberAddress,
        status: ConnectivityStatus.ONLINE
      })
    },

    leaveCommunity: async (communityId: string, memberAddress: EthAddress): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)

      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      const isMember = await communitiesDb.isMemberOfCommunity(communityId, memberAddress)

      if (!isMember) {
        logger.info(`User ${memberAddress} is not a member of community ${communityId}, returning 204`)
        return
      }

      await communityRoles.validatePermissionToLeaveCommunity(communityId, memberAddress)

      await communitiesDb.kickMemberFromCommunity(communityId, memberAddress)

      await pubsub.publishInChannel(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
        communityId,
        memberAddress,
        status: ConnectivityStatus.OFFLINE
      })
    },

    updateMemberRole: async (
      communityId: string,
      updaterAddress: EthAddress,
      targetAddress: EthAddress,
      newRole: CommunityRole
    ): Promise<void> => {
      const communityExists = await communitiesDb.communityExists(communityId)

      if (!communityExists) {
        throw new CommunityNotFoundError(communityId)
      }

      await communityRoles.validatePermissionToUpdateMemberRole(communityId, updaterAddress, targetAddress, newRole)

      await communitiesDb.updateMemberRole(communityId, targetAddress, newRole)
    },

    aggregateWithProfiles
  }
}
