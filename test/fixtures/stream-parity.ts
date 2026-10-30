import {
  FriendshipUpdate,
  FriendConnectivityUpdate,
  BlockUpdate,
  PrivateVoiceChatUpdate,
  CommunityMemberConnectivityUpdate,
  CommunityVoiceChatUpdate,
  ConnectivityStatus,
  CommunityVoiceChatStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Action, SubscriptionEventsEmitter } from '../../src/types'
import { VoiceChatStatus } from '../../src/logic/voice/types'

export const RECIPIENT = '0x1111111111111111111111111111111111111111'
export const ACTOR = '0x2222222222222222222222222222222222222222'
export const STREAM_METHODS = {
  friendship_updates: 'subscribeToFriendshipUpdates',
  friend_connectivity_updates: 'subscribeToFriendConnectivityUpdates',
  block_updates: 'subscribeToBlockUpdates',
  private_voice_chat_updates: 'subscribeToPrivateVoiceChatUpdates',
  community_member_connectivity_updates: 'subscribeToCommunityMemberConnectivityUpdates',
  community_voice_chat_updates: 'subscribeToCommunityVoiceChatUpdates'
} as const
export type StreamName = keyof typeof STREAM_METHODS
export type RpcUpdate =
  | FriendshipUpdate
  | FriendConnectivityUpdate
  | BlockUpdate
  | PrivateVoiceChatUpdate
  | CommunityMemberConnectivityUpdate
  | CommunityVoiceChatUpdate
export type ParityFixture = {
  name: string
  stream: StreamName
  event: keyof SubscriptionEventsEmitter
  update: SubscriptionEventsEmitter[keyof SubscriptionEventsEmitter]
}

// Independent contract interpretation: do not import production JSON mappers here.
export function normalizeRpc(stream: StreamName, value: RpcUpdate): unknown {
  switch (stream) {
    case 'friendship_updates': {
      const update = (value as FriendshipUpdate).update
      if (!update) throw new Error('Missing friendship payload')
      if (update.$case === 'request')
        return {
          action: 'request',
          id: update.request.id,
          address: update.request.friend?.address,
          createdAt: update.request.createdAt,
          ...(update.request.message ? { message: update.request.message } : {})
        }
      switch (update.$case) {
        case 'accept':
          return { action: 'accept', address: update.accept.user?.address }
        case 'reject':
          return { action: 'reject', address: update.reject.user?.address }
        case 'cancel':
          return { action: 'cancel', address: update.cancel.user?.address }
        case 'delete':
          return { action: 'delete', address: update.delete.user?.address }
        case 'block':
          return { action: 'block', address: update.block.user?.address }
      }
      throw new Error('Unhandled friendship variant')
    }
    case 'friend_connectivity_updates': {
      const update = value as FriendConnectivityUpdate
      return { address: update.friend?.address, status: ['online', 'offline', 'away'][update.status] }
    }
    case 'block_updates': {
      const update = value as BlockUpdate
      return { address: update.address, isBlocked: update.isBlocked }
    }
    case 'private_voice_chat_updates': {
      const update = value as PrivateVoiceChatUpdate
      return {
        callId: update.callId,
        status: ['requested', 'accepted', 'rejected', 'ended', 'expired'][update.status],
        ...(update.caller ? { callerAddress: update.caller.address } : {}),
        ...(update.credentials ? { connectionUrl: update.credentials.connectionUrl } : {})
      }
    }
    case 'community_member_connectivity_updates': {
      const update = value as CommunityMemberConnectivityUpdate
      return {
        communityId: update.communityId,
        memberAddress: update.member?.address,
        status: ['online', 'offline', 'away'][update.status]
      }
    }
    case 'community_voice_chat_updates': {
      const update = value as CommunityVoiceChatUpdate
      return {
        communityId: update.communityId,
        status: update.status === 0 ? 'started' : 'ended',
        createdAt: update.createdAt,
        ...(update.endedAt ? { endedAt: update.endedAt } : {}),
        positions: update.positions,
        worlds: update.worlds,
        isMember: update.isMember,
        communityName: update.communityName,
        ...(update.communityImage ? { communityImage: update.communityImage } : {})
      }
    }
  }
}

export function createParityFixtures(recipient = RECIPIENT): ParityFixture[] {
  return [
    ...Object.values(Action).map(
      (action): ParityFixture => ({
        name: `friendship ${action}`,
        stream: 'friendship_updates',
        event: 'friendshipUpdate',
        update: {
          id: 'request-1',
          from: ACTOR,
          to: recipient,
          action,
          timestamp: 1700000000000,
          metadata: { message: 'hello 👋' }
        }
      })
    ),
    {
      name: 'request without message',
      stream: 'friendship_updates',
      event: 'friendshipUpdate',
      update: { id: 'request-2', from: ACTOR, to: recipient, action: Action.REQUEST, timestamp: 1700000000001 }
    },
    ...[ConnectivityStatus.ONLINE, ConnectivityStatus.OFFLINE, ConnectivityStatus.AWAY].flatMap(
      (status): ParityFixture[] => [
        {
          name: `friend connectivity ${status}`,
          stream: 'friend_connectivity_updates',
          event: 'friendConnectivityUpdate',
          update: { address: ACTOR, status }
        },
        {
          name: `community connectivity ${status}`,
          stream: 'community_member_connectivity_updates',
          event: 'communityMemberConnectivityUpdate',
          update: { communityId: 'community-1', memberAddress: ACTOR, status }
        }
      ]
    ),
    ...[true, false].map(
      (isBlocked): ParityFixture => ({
        name: `block ${isBlocked}`,
        stream: 'block_updates',
        event: 'blockUpdate',
        update: { blockerAddress: ACTOR, blockedAddress: recipient, isBlocked }
      })
    ),
    ...Object.values(VoiceChatStatus).map(
      (status): ParityFixture => ({
        name: `private call ${status}`,
        stream: 'private_voice_chat_updates',
        event: 'privateVoiceChatUpdate',
        update: {
          callId: 'call-1',
          status,
          callerAddress: ACTOR,
          calleeAddress: recipient,
          ...(status === VoiceChatStatus.ACCEPTED
            ? { credentials: { connectionUrl: 'livekit:wss://example?token=secret' } }
            : {})
        }
      })
    ),
    ...[CommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED, CommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_ENDED].map(
      (status): ParityFixture => ({
        name: `community voice ${status}`,
        stream: 'community_voice_chat_updates',
        event: 'communityVoiceChatUpdate',
        update: {
          communityId: 'community-1',
          status,
          createdAt: 1700000000000,
          ...(status === CommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_ENDED ? { endedAt: 1700000010000 } : {}),
          positions: ['1,2'],
          worlds: ['parity.dcl.eth'],
          isMember: true,
          communityName: 'Parity',
          communityImage: 'https://example.org/image.png'
        }
      })
    )
  ]
}
