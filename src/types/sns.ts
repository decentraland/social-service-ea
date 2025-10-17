import {
  CommunityDeletedEvent,
  CommunityDeletedContentViolationEvent,
  CommunityInviteReceivedEvent,
  CommunityMemberBannedEvent,
  CommunityMemberRemovedEvent,
  CommunityRenamedEvent,
  CommunityRequestToJoinAcceptedEvent,
  CommunityRequestToJoinReceivedEvent,
  FriendshipAcceptedEvent,
  FriendshipRequestEvent,
  ReferralInvitedUsersAcceptedEvent,
  ReferralNewTierReachedEvent
} from '@dcl/schemas'

export type SnsEvent =
  | FriendshipRequestEvent
  | FriendshipAcceptedEvent
  | ReferralInvitedUsersAcceptedEvent
  | ReferralNewTierReachedEvent
  | CommunityDeletedEvent
  | CommunityRenamedEvent
  | CommunityMemberBannedEvent
  | CommunityMemberRemovedEvent
  | CommunityRequestToJoinAcceptedEvent
  | CommunityRequestToJoinReceivedEvent
  | CommunityInviteReceivedEvent
  | CommunityDeletedContentViolationEvent
