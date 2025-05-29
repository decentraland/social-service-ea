export type Friendship = {
  id: string
  address_requester: string
  address_requested: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type SocialSettings = {
  address: string
  private_messages_privacy: PrivateMessagesPrivacy
  blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting
}

export enum PrivateMessagesPrivacy {
  ONLY_FRIENDS = 'only_friends',
  ALL = 'all'
}

export enum BlockedUsersMessagesVisibilitySetting {
  SHOW_MESSAGES = 'show_messages',
  DO_NOT_SHOW_MESSAGES = 'do_not_show_messages'
}

export type User = {
  address: string
}

export type BlockUserWithDate = User & {
  blocked_at: Date
}

export enum Action {
  REQUEST = 'request', // request a friendship
  CANCEL = 'cancel', // cancel a friendship request
  ACCEPT = 'accept', // accept a friendship request
  REJECT = 'reject', // reject a friendship request
  DELETE = 'delete', // delete a friendship
  BLOCK = 'block' // block a user
}

export type FriendshipAction = {
  id: string
  friendship_id: string
  action: Action
  acting_user: string
  metadata?: Record<string, any>
  timestamp: string
}

export enum FriendshipStatus {
  Requested,
  Friends,
  NotFriends
}

export type FriendshipRequest = {
  id: string
  address: string
  timestamp: string
  metadata: Record<string, any> | null
}

export type Pagination = {
  limit: number
  offset: number
}

export type CommunityPermission =
  | 'edit_info'
  | 'add_places'
  | 'remove_places'
  | 'accept_requests'
  | 'reject_requests'
  | 'ban_players'
  | 'send_invitations'
  | 'edit_settings'
  | 'delete_community'
  | 'assign_roles'

export enum CommunityRole {
  Owner = 'owner',
  Moderator = 'moderator',
  Member = 'member',
  None = 'none'
}

export type CommunityDB = {
  id?: string
  name: string
  description: string
  owner_address: string
  private: boolean
  active: boolean
  created_at?: string
  updated_at?: string
}

export type Community = {
  id: string
  name: string
  description: string
  ownerAddress: string
  role: CommunityRole
  privacy: 'public' | 'private'
  active: boolean
}

export type CommunityWithMembersCount = Community & {
  membersCount: number
}
