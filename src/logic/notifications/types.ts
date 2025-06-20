import { Events } from '@dcl/schemas'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { IPublisherComponent } from '../../types'
import {
  FriendshipRequestEvent,
  FriendshipAcceptedEvent,
  ReferralInvitedUsersAcceptedEvent,
  ReferralNewTierReachedEvent
} from '@dcl/schemas'

export enum NotificationType {
  FRIENDSHIP = 'friendship',
  REFERRAL = 'referral'
}

export enum NotificationAction {
  FRIENDSHIP_REQUEST = 'friendship_request',
  FRIENDSHIP_ACCEPT = 'friendship_accept',
  REFERRAL_INVITED_USERS_ACCEPTED = 'referral_invited_users_accepted',
  REFERRAL_NEW_TIER_REACHED = 'referral_new_tier_reached'
}

export type NotificationFriendshipContext = {
  type: Events.Type.SOCIAL_SERVICE
  requestId: string
  senderAddress: string
  receiverAddress: string
  senderProfile: Pick<Profile, 'avatars'>
  receiverProfile: Pick<Profile, 'avatars'>
  message?: string
}

export type NotificationReferralContext = {
  type: Events.Type.REFERRAL
  title: string
  description: string
  address: string
  tier: number
  url: string
  image: string
  invitedUserAddress: string
  invitedUsers: number
  rarity?: string | null
}

export type NotificationContext = NotificationFriendshipContext | NotificationReferralContext

export type NotificationFriendshipInput = {
  requestId: string
  senderAddress: string
  receiverAddress: string
  senderProfile: Pick<Profile, 'avatars'>
  receiverProfile: Pick<Profile, 'avatars'>
  message?: string
  [key: string]: any
}

export type NotificationReferralInput = {
  title: string
  description: string
  address: string
  tier: number
  url: string
  image: string
  invitedUserAddress: string
  invitedUsers: number
  rarity?: string | null
  [key: string]: any
}

export type NotificationHandler = (sns: IPublisherComponent, context: NotificationContext) => Promise<void>

export type NotificationEventConfig = {
  eventType: Events.Type
  eventSubType: string
  build: (
    context: NotificationContext
  ) =>
    | FriendshipRequestEvent
    | FriendshipAcceptedEvent
    | ReferralInvitedUsersAcceptedEvent
    | ReferralNewTierReachedEvent
}

export type NotificationEventConfigMap = Record<NotificationAction, NotificationEventConfig>
