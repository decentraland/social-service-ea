import { AppComponents } from '../../types'
import { getFriendsService } from '../handlers/rpc/get-friends'
import { getMutualFriendsService } from '../handlers/rpc/get-mutual-friends'
import { getPendingFriendshipRequestsService } from '../handlers/rpc/get-pending-friendship-requests'
import { upsertFriendshipService } from '../handlers/rpc/upsert-friendship'
import { subscribeToFriendshipUpdatesService } from '../handlers/rpc/subscribe-to-friendship-updates'
import { getSentFriendshipRequestsService } from '../handlers/rpc/get-sent-friendship-requests'
import { getFriendshipStatusService } from '../handlers/rpc/get-friendship-status'
import { subscribeToFriendConnectivityUpdatesService } from '../handlers/rpc/subscribe-to-friend-connectivity-updates'
import { getPrivateMessagesSettingsService } from '../handlers/rpc/get-private-messages-settings'
import { upsertSocialSettingsService } from '../handlers/rpc/upsert-social-settings'
import { getSocialSettingsService } from '../handlers/rpc/get-social-settings'
import { blockUserService } from '../handlers/rpc/block-user'
import { getBlockedUsersService } from '../handlers/rpc/get-blocked-users'
import { unblockUserService } from '../handlers/rpc/unblock-user'
import { getBlockingStatusService } from '../handlers/rpc/get-blocking-status'
import { subscribeToBlockUpdatesService } from '../handlers/rpc/subscribe-to-block-updates'
import { startPrivateVoiceChatService } from '../handlers/rpc/start-private-voice-chat'
import { acceptPrivateVoiceChatService } from '../handlers/rpc/accept-private-voice-chat'
import { rejectPrivateVoiceChatService } from '../handlers/rpc/reject-private-voice-chat'
import { endPrivateVoiceChatService } from '../handlers/rpc/end-private-voice-chat'
import { getIncomingPrivateVoiceChatRequestsService } from '../handlers/rpc/get-incoming-private-voice-chat-requests'
import { subscribeToPrivateVoiceChatUpdatesService } from '../handlers/rpc/subscribe-to-private-voice-chat-updates'
import { subscribeToCommunityMemberConnectivityUpdatesService } from '../handlers/rpc/subscribe-to-community-member-connectivity-updates'
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
