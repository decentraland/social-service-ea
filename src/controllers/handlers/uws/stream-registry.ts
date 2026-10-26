import {
  CommunityVoiceChatStatus,
  ConnectivityStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Action, AppComponents, RpcServerContext, SubscriptionEventsEmitter } from '../../../types'
import { StreamEvent } from '../../../adapters/rpc-server/metrics-wrapper'
import { VoiceChatStatus } from '../../../logic/voice/types'

/**
 * The streams available on the plain WebSocket protocol, keyed by the name clients subscribe with.
 *
 * They read the same per-user updates as the RPC streams (`updateHandler.handleSubscriptionUpdates`,
 * same event names and filters), but each one maps them to its own JSON event instead of the
 * protobuf messages, so this protocol does not depend on `social_service_v2.proto`. Unlike the RPC
 * streams, the events carry addresses only: clients resolve the profiles themselves.
 */

export type StreamDefinition = {
  /** Opens the subscription. The returned generator ends when the subscription is destroyed. */
  open: (context: RpcServerContext) => AsyncGenerator<unknown>
}

export type ConnectivityStatusName = 'online' | 'offline' | 'away'

export type FriendshipStreamEvent =
  | {
      action: Action.REQUEST
      id: string
      address: string
      createdAt: number
      message?: string
    }
  | { action: Exclude<Action, Action.REQUEST>; address: string }

export type FriendConnectivityStreamEvent = { address: string; status: ConnectivityStatusName }

export type BlockStreamEvent = { address: string; isBlocked: boolean }

export type PrivateVoiceChatStreamEvent = {
  callId: string
  status: VoiceChatStatus
  /** Only when the call is requested: who is calling. */
  callerAddress?: string
  /** Only for the caller when the call is accepted: credentials to join it. */
  connectionUrl?: string
}

export type CommunityMemberConnectivityStreamEvent = {
  communityId: string
  memberAddress: string
  status: ConnectivityStatusName
}

export type CommunityVoiceChatStreamEvent = {
  communityId: string
  status: 'started' | 'ended'
  createdAt: number
  endedAt?: number
  positions: string[]
  worlds: string[]
  isMember: boolean
  communityName: string
  communityImage?: string
}

const CONNECTIVITY_STATUS_NAMES: Partial<Record<ConnectivityStatus, ConnectivityStatusName>> = {
  [ConnectivityStatus.ONLINE]: 'online',
  [ConnectivityStatus.OFFLINE]: 'offline',
  [ConnectivityStatus.AWAY]: 'away'
}

const COMMUNITY_VOICE_CHAT_STATUS_NAMES: Partial<Record<CommunityVoiceChatStatus, 'started' | 'ended'>> = {
  [CommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED]: 'started',
  [CommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_ENDED]: 'ended'
}

export function toFriendshipStreamEvent(
  update: SubscriptionEventsEmitter['friendshipUpdate']
): FriendshipStreamEvent | null {
  if (update.action === Action.REQUEST) {
    return {
      action: Action.REQUEST,
      id: update.id,
      address: update.from,
      createdAt: update.timestamp,
      ...(update.metadata?.message && { message: update.metadata.message })
    }
  }

  return Object.values(Action).includes(update.action) ? { action: update.action, address: update.from } : null
}

export function toFriendConnectivityStreamEvent(
  update: SubscriptionEventsEmitter['friendConnectivityUpdate']
): FriendConnectivityStreamEvent | null {
  const status = CONNECTIVITY_STATUS_NAMES[update.status]
  return status ? { address: update.address, status } : null
}

export function toBlockStreamEvent(update: SubscriptionEventsEmitter['blockUpdate']): BlockStreamEvent {
  return { address: update.blockerAddress, isBlocked: update.isBlocked }
}

export function toPrivateVoiceChatStreamEvent(
  update: SubscriptionEventsEmitter['privateVoiceChatUpdate']
): PrivateVoiceChatStreamEvent {
  return {
    callId: update.callId,
    status: update.status,
    ...(update.status === VoiceChatStatus.REQUESTED && { callerAddress: update.callerAddress }),
    ...(update.credentials && { connectionUrl: update.credentials.connectionUrl })
  }
}

export function toCommunityMemberConnectivityStreamEvent(
  update: SubscriptionEventsEmitter['communityMemberConnectivityUpdate']
): CommunityMemberConnectivityStreamEvent | null {
  const status = CONNECTIVITY_STATUS_NAMES[update.status]
  return status ? { communityId: update.communityId, memberAddress: update.memberAddress, status } : null
}

export function toCommunityVoiceChatStreamEvent(
  update: SubscriptionEventsEmitter['communityVoiceChatUpdate']
): CommunityVoiceChatStreamEvent | null {
  const status = COMMUNITY_VOICE_CHAT_STATUS_NAMES[update.status]
  if (!status) return null

  return {
    communityId: update.communityId,
    status,
    createdAt: update.createdAt,
    ...(update.endedAt !== undefined && { endedAt: update.endedAt }),
    positions: update.positions,
    worlds: update.worlds,
    isMember: update.isMember,
    communityName: update.communityName,
    ...(update.communityImage !== undefined && { communityImage: update.communityImage })
  }
}

export function createStreamRegistry({
  updateHandler,
  friendsDb,
  peersStats
}: Pick<AppComponents, 'updateHandler' | 'friendsDb' | 'peersStats'>): Record<string, StreamDefinition> {
  return {
    [StreamEvent.FRIENDSHIP_UPDATES]: {
      open: (context) =>
        updateHandler.handleSubscriptionUpdates<FriendshipStreamEvent, SubscriptionEventsEmitter['friendshipUpdate']>({
          rpcContext: context,
          eventName: 'friendshipUpdate',
          getAddressFromUpdate: (update) => update.from,
          shouldHandleUpdate: (update) => update.from !== context.address && update.to === context.address,
          parser: toFriendshipStreamEvent
        })
    },
    [StreamEvent.FRIEND_CONNECTIVITY_UPDATES]: {
      open: (context) =>
        updateHandler.handleSubscriptionUpdates<
          FriendConnectivityStreamEvent,
          SubscriptionEventsEmitter['friendConnectivityUpdate']
        >({
          rpcContext: context,
          eventName: 'friendConnectivityUpdate',
          getAddressFromUpdate: (update) => update.address,
          shouldHandleUpdate: (update) => update.address !== context.address,
          parser: toFriendConnectivityStreamEvent,
          // The friends already online when the subscription starts, as with the RPC stream.
          getInitialUpdates: async () => {
            const onlinePeers = await peersStats.getConnectedPeers()
            const onlineFriends = await friendsDb.getOnlineFriends(context.address, onlinePeers)

            return onlineFriends.map(({ address }) => ({ address, status: 'online' as const }))
          }
        })
    },
    [StreamEvent.BLOCK_UPDATES]: {
      open: (context) =>
        updateHandler.handleSubscriptionUpdates<BlockStreamEvent, SubscriptionEventsEmitter['blockUpdate']>({
          rpcContext: context,
          eventName: 'blockUpdate',
          getAddressFromUpdate: (update) => update.blockerAddress,
          shouldHandleUpdate: (update) => update.blockedAddress === context.address,
          parser: toBlockStreamEvent
        })
    },
    [StreamEvent.PRIVATE_VOICE_CHAT_UPDATES]: {
      open: (context) =>
        updateHandler.handleSubscriptionUpdates<
          PrivateVoiceChatStreamEvent,
          SubscriptionEventsEmitter['privateVoiceChatUpdate']
        >({
          rpcContext: context,
          eventName: 'privateVoiceChatUpdate',
          getAddressFromUpdate: () => 'not-needed',
          shouldHandleUpdate: (update) => Object.values(VoiceChatStatus).includes(update.status),
          parser: toPrivateVoiceChatStreamEvent
        })
    },
    [StreamEvent.COMMUNITY_MEMBER_CONNECTIVITY_UPDATES]: {
      open: (context) =>
        updateHandler.handleSubscriptionUpdates<
          CommunityMemberConnectivityStreamEvent,
          SubscriptionEventsEmitter['communityMemberConnectivityUpdate']
        >({
          rpcContext: context,
          eventName: 'communityMemberConnectivityUpdate',
          getAddressFromUpdate: (update) => update.memberAddress,
          shouldHandleUpdate: () => true,
          parser: toCommunityMemberConnectivityStreamEvent
        })
    },
    [StreamEvent.COMMUNITY_VOICE_CHAT_UPDATES]: {
      open: (context) =>
        updateHandler.handleSubscriptionUpdates<
          CommunityVoiceChatStreamEvent,
          SubscriptionEventsEmitter['communityVoiceChatUpdate']
        >({
          rpcContext: context,
          eventName: 'communityVoiceChatUpdate',
          getAddressFromUpdate: () => 'not-needed',
          shouldHandleUpdate: () => true,
          parser: toCommunityVoiceChatStreamEvent
        })
    }
  }
}
