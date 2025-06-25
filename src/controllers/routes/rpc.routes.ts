import { AppComponents } from '../../types'
import { getFriendsService } from '../../adapters/rpc-server/services/get-friends'
import { getMutualFriendsService } from '../../adapters/rpc-server/services/get-mutual-friends'
import { getPendingFriendshipRequestsService } from '../../adapters/rpc-server/services/get-pending-friendship-requests'
import { upsertFriendshipService } from '../../adapters/rpc-server/services/upsert-friendship'
import { subscribeToFriendshipUpdatesService } from '../../adapters/rpc-server/services/subscribe-to-friendship-updates'
import { getSentFriendshipRequestsService } from '../../adapters/rpc-server/services/get-sent-friendship-requests'
import { getFriendshipStatusService } from '../../adapters/rpc-server/services/get-friendship-status'
import { subscribeToFriendConnectivityUpdatesService } from '../../adapters/rpc-server/services/subscribe-to-friend-connectivity-updates'
import { getPrivateMessagesSettingsService } from '../../adapters/rpc-server/services/get-private-messages-settings'
import { upsertSocialSettingsService } from '../../adapters/rpc-server/services/upsert-social-settings'
import { getSocialSettingsService } from '../../adapters/rpc-server/services/get-social-settings'
import { blockUserService } from '../../adapters/rpc-server/services/block-user'
import { getBlockedUsersService } from '../../adapters/rpc-server/services/get-blocked-users'
import { unblockUserService } from '../../adapters/rpc-server/services/unblock-user'
import { getBlockingStatusService } from '../../adapters/rpc-server/services/get-blocking-status'
import { subscribeToBlockUpdatesService } from '../../adapters/rpc-server/services/subscribe-to-block-updates'
import { startPrivateVoiceChatService } from '../../adapters/rpc-server/services/start-private-voice-chat'
import { acceptPrivateVoiceChatService } from '../../adapters/rpc-server/services/accept-private-voice-chat'
import { rejectPrivateVoiceChatService } from '../../adapters/rpc-server/services/reject-private-voice-chat'
import { endPrivateVoiceChatService } from '../../adapters/rpc-server/services/end-private-voice-chat'
import { getIncomingPrivateVoiceChatRequestsService } from '../../adapters/rpc-server/services/get-incoming-private-voice-chat-requests'
import { subscribeToPrivateVoiceChatUpdatesService } from '../../adapters/rpc-server/services/subscribe-to-private-voice-chat-updates'
import { subscribeToCommunityMemberConnectivityUpdatesService } from '../../adapters/rpc-server/services/subscribe-to-community-member-connectivity-updates'
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
    }
  }
}
