import { AppComponents } from '../../types'
import {
  getFriendsService,
  getMutualFriendsService,
  getPendingFriendshipRequestsService,
  upsertFriendshipService,
  subscribeToFriendshipUpdatesService,
  getSentFriendshipRequestsService,
  getFriendshipStatusService,
  blockUserService,
  getBlockedUsersService,
  unblockUserService,
  getBlockingStatusService,
  getPrivateMessagesSettingsService,
  upsertSocialSettingsService,
  getSocialSettingsService,
  startPrivateVoiceChatService,
  acceptPrivateVoiceChatService,
  rejectPrivateVoiceChatService,
  endPrivateVoiceChatService,
  getIncomingPrivateVoiceChatRequestsService,
  subscribeToCommunityMemberConnectivityUpdatesService,
  subscribeToFriendConnectivityUpdatesService,
  subscribeToBlockUpdatesService,
  subscribeToPrivateVoiceChatUpdatesService,
  startCommunityVoiceChatService,
  joinCommunityVoiceChatService,
  requestToSpeakInCommunityVoiceChatService,
  promoteSpeakerInCommunityVoiceChatService,
  demoteSpeakerInCommunityVoiceChatService,
  kickPlayerFromCommunityVoiceChatService,
  subscribeToCommunityVoiceChatUpdatesService,
  getMutualFriendsV2Service
} from '../handlers/rpc'
import { ServiceType, StreamEvent } from '../../adapters/rpc-server/metrics-wrapper'

export type RpcServiceCreator = {
  creator: any
  type: ServiceType
  event?: string
}

export type RpcServiceCreators = Record<string, RpcServiceCreator>

export async function setupRpcRoutes(components: AppComponents): Promise<RpcServiceCreators> {
  return {
    getFriends: {
      creator: getFriendsService({ components }),
      type: ServiceType.CALL
    },
    getMutualFriends: {
      creator: getMutualFriendsService({ components }),
      type: ServiceType.CALL
    },
    getMutualFriendsV2: {
      creator: getMutualFriendsV2Service({ components }),
      type: ServiceType.CALL
    },
    getPendingFriendshipRequests: {
      creator: getPendingFriendshipRequestsService({ components }),
      type: ServiceType.CALL
    },
    getSentFriendshipRequests: {
      creator: getSentFriendshipRequestsService({ components }),
      type: ServiceType.CALL
    },
    upsertFriendship: {
      creator: upsertFriendshipService({ components }),
      type: ServiceType.CALL
    },
    getFriendshipStatus: {
      creator: getFriendshipStatusService({ components }),
      type: ServiceType.CALL
    },
    subscribeToFriendshipUpdates: {
      creator: subscribeToFriendshipUpdatesService({ components }),
      type: ServiceType.STREAM,
      event: StreamEvent.FRIENDSHIP_UPDATES
    },
    subscribeToFriendConnectivityUpdates: {
      creator: subscribeToFriendConnectivityUpdatesService({ components }),
      type: ServiceType.STREAM,
      event: StreamEvent.FRIEND_CONNECTIVITY_UPDATES
    },
    subscribeToBlockUpdates: {
      creator: subscribeToBlockUpdatesService({ components }),
      type: ServiceType.STREAM,
      event: StreamEvent.BLOCK_UPDATES
    },
    subscribeToPrivateVoiceChatUpdates: {
      creator: subscribeToPrivateVoiceChatUpdatesService({ components }),
      type: ServiceType.STREAM,
      event: StreamEvent.PRIVATE_VOICE_CHAT_UPDATES
    },
    blockUser: {
      creator: blockUserService({ components }),
      type: ServiceType.CALL
    },
    unblockUser: {
      creator: unblockUserService({ components }),
      type: ServiceType.CALL
    },
    getBlockedUsers: {
      creator: getBlockedUsersService({ components }),
      type: ServiceType.CALL
    },
    getBlockingStatus: {
      creator: getBlockingStatusService({ components }),
      type: ServiceType.CALL
    },
    getPrivateMessagesSettings: {
      creator: getPrivateMessagesSettingsService({ components }),
      type: ServiceType.CALL
    },
    upsertSocialSettings: {
      creator: upsertSocialSettingsService({ components }),
      type: ServiceType.CALL
    },
    getSocialSettings: {
      creator: getSocialSettingsService({ components }),
      type: ServiceType.CALL
    },
    startPrivateVoiceChat: {
      creator: startPrivateVoiceChatService({ components }),
      type: ServiceType.CALL
    },
    acceptPrivateVoiceChat: {
      creator: acceptPrivateVoiceChatService({ components }),
      type: ServiceType.CALL
    },
    rejectPrivateVoiceChat: {
      creator: rejectPrivateVoiceChatService({ components }),
      type: ServiceType.CALL
    },
    endPrivateVoiceChat: {
      creator: endPrivateVoiceChatService({ components }),
      type: ServiceType.CALL
    },
    getIncomingPrivateVoiceChatRequest: {
      creator: getIncomingPrivateVoiceChatRequestsService({ components }),
      type: ServiceType.CALL
    },
    subscribeToCommunityMemberConnectivityUpdates: {
      creator: subscribeToCommunityMemberConnectivityUpdatesService({ components }),
      type: ServiceType.COMMUNITIES,
      event: StreamEvent.COMMUNITY_MEMBER_CONNECTIVITY_UPDATES
    },
    startCommunityVoiceChat: {
      creator: startCommunityVoiceChatService({ components }),
      type: ServiceType.CALL
    },
    joinCommunityVoiceChat: {
      creator: joinCommunityVoiceChatService({ components }),
      type: ServiceType.CALL
    },
    requestToSpeakInCommunityVoiceChat: {
      creator: requestToSpeakInCommunityVoiceChatService({ components }),
      type: ServiceType.CALL
    },
    promoteSpeakerInCommunityVoiceChat: {
      creator: promoteSpeakerInCommunityVoiceChatService({ components }),
      type: ServiceType.CALL
    },
    demoteSpeakerInCommunityVoiceChat: {
      creator: demoteSpeakerInCommunityVoiceChatService({ components }),
      type: ServiceType.CALL
    },
    kickPlayerFromCommunityVoiceChat: {
      creator: kickPlayerFromCommunityVoiceChatService({ components }),
      type: ServiceType.CALL
    },
    subscribeToCommunityVoiceChatUpdates: {
      creator: subscribeToCommunityVoiceChatUpdatesService({ components }),
      type: ServiceType.STREAM,
      event: StreamEvent.COMMUNITY_VOICE_CHAT_UPDATES
    }
  }
}
