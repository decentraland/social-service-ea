import { Emitter } from 'mitt'
import {
  CommunityVoiceChatUpdate,
  ConnectivityStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { EthAddress } from '@dcl/schemas'
import { Action } from './entities'
import { ISubscribersContext } from './components'
import { VoiceChatStatus } from '../logic/voice/types'

/** Who a community voice room was announced to. */
export type CommunityVoiceChatNotificationScope = 'all' | 'members'

export type SubscriptionEventsEmitter = {
  friendshipUpdate: {
    id: string
    to: string
    from: string
    action: Action
    timestamp: number
    metadata?: { message: string }
  }
  friendConnectivityUpdate: {
    address: string
    status: ConnectivityStatus
  }
  blockUpdate: {
    blockerAddress: string
    blockedAddress: string
    isBlocked: boolean
  }
  privateVoiceChatUpdate: {
    callId: string
    status: VoiceChatStatus
    callerAddress?: string
    calleeAddress?: string
    credentials?: {
      connectionUrl: string
    }
  }
  communityJoinUpdate: {
    communityId: string
    memberAddress: EthAddress
  }
  communityLeaveUpdate: {
    communityId: string
    memberAddress: EthAddress
    reason: CommunityLeaveReason
  }
  communityMemberConnectivityUpdate: {
    communityId: string
    memberAddress: EthAddress
    status: ConnectivityStatus
  }
  communityVoiceChatUpdate: CommunityVoiceChatUpdate & {
    creatorAddress?: string // Internal field to exclude creator from notifications
    // Internal field: who the room was announced to when it STARTED. Carried on the ended update
    // so cleanup reaches exactly that audience, whatever the community's privacy is by then.
    notificationScope?: CommunityVoiceChatNotificationScope
  }
  communityDeletedUpdate: {
    communityId: string
  }
}

export enum CommunityLeaveReason {
  Kicked = 'kicked',
  Banned = 'banned',
  Left = 'left'
}

export type Subscribers = Record<string, Emitter<SubscriptionEventsEmitter>>

export type SubscriptionContext = {
  address: string
  // Identifies the WebSocket connection backing this RPC context. Always set in
  // production (populated by attachUser/attachTransport); optional so test contexts
  // can omit it. Used to disambiguate which connection issued a subscription.
  wsConnectionId?: string
  subscribersContext: ISubscribersContext
  /** Optional transport policy when a subscription loses queued updates. */
  onSubscriptionOverflow?: () => void
}

export enum StreamEvent {
  FRIENDSHIP_UPDATES = 'friendship_updates',
  FRIEND_CONNECTIVITY_UPDATES = 'friend_connectivity_updates',
  BLOCK_UPDATES = 'block_updates',
  PRIVATE_VOICE_CHAT_UPDATES = 'private_voice_chat_updates',
  COMMUNITY_MEMBER_CONNECTIVITY_UPDATES = 'community_member_connectivity_updates',
  COMMUNITY_VOICE_CHAT_UPDATES = 'community_voice_chat_updates'
}

export type StreamDefinition = {
  /** Open the stream for one authenticated connection. */
  open: (context: SubscriptionContext) => AsyncGenerator<unknown>
}
