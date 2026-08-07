export type Friendship = {
  id: string
  address_requester: string
  address_requested: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PrivateVoiceChat = {
  id: string
  caller_address: string
  callee_address: string
  created_at: Date
}

export type SocialSettings = {
  address: string
  private_messages_privacy: PrivateMessagesPrivacy
  blocked_users_messages_visibility: BlockedUsersMessagesVisibilitySetting
  show_situation_reactions: SituationReactionsVisibility
}

export enum PrivateMessagesPrivacy {
  ONLY_FRIENDS = 'only_friends',
  ALL = 'all'
}

export enum BlockedUsersMessagesVisibilitySetting {
  SHOW_MESSAGES = 'show_messages',
  DO_NOT_SHOW_MESSAGES = 'do_not_show_messages'
}

export enum SituationReactionsVisibility {
  SHOW = 'show',
  HIDE = 'hide'
}

export type User = {
  address: string
}

export type BlockedUserWithDate = User & {
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

// TODO: Use PaginatedParameters from @dcl/schemas
export type Pagination = {
  limit: number
  offset: number
}

export type CommunityPermission =
  | 'edit_info'
  | 'edit_name'
  | 'add_places'
  | 'remove_places'
  | 'accept_requests'
  | 'reject_requests'
  | 'view_requests'
  | 'ban_players'
  | 'send_invitations'
  | 'edit_settings'
  | 'delete_community'
  | 'assign_roles'
  | 'invite_users'
  | 'create_posts'
  | 'delete_posts'

export enum CommunityRole {
  Owner = 'owner',
  Moderator = 'moderator',
  Member = 'member',
  None = 'none'
}

// [targetRole]: [roles that can act on targetRole]
export const ROLE_ACTION_TRANSITIONS: Record<CommunityRole, CommunityRole[]> = {
  [CommunityRole.Owner]: [], // No one can act on owners
  [CommunityRole.Moderator]: [CommunityRole.Owner], // Only owners can act on moderators
  [CommunityRole.Member]: [CommunityRole.Owner, CommunityRole.Moderator], // Owners and moderators can act on members
  [CommunityRole.None]: [] // N/A
}

export const OWNER_PERMISSIONS: CommunityPermission[] = [
  'edit_info',
  'edit_name',
  'add_places',
  'remove_places',
  'accept_requests',
  'reject_requests',
  'view_requests',
  'ban_players',
  'send_invitations',
  'edit_settings',
  'delete_community',
  'assign_roles',
  'invite_users',
  'create_posts',
  'delete_posts'
]

export const MODERATOR_PERMISSIONS: CommunityPermission[] = [
  'edit_info',
  'add_places',
  'remove_places',
  'accept_requests',
  'reject_requests',
  'view_requests',
  'ban_players',
  'send_invitations',
  'invite_users',
  'create_posts',
  'delete_posts'
]

export const COMMUNITY_ROLES: Record<CommunityRole, CommunityPermission[]> = {
  [CommunityRole.Owner]: OWNER_PERMISSIONS,
  [CommunityRole.Moderator]: MODERATOR_PERMISSIONS,
  [CommunityRole.Member]: [],
  [CommunityRole.None]: []
}

export function getRolePermissions(role: CommunityRole): CommunityPermission[] {
  return COMMUNITY_ROLES[role] ?? []
}

export function hasPermission(role: CommunityRole, permission: CommunityPermission): boolean {
  return getRolePermissions(role).includes(permission)
}

export function isMember(role: CommunityRole): boolean {
  return !!role && role !== CommunityRole.None
}

/** Whether `actorRole` outranks `targetRole` enough to act on it. */
export function canActOnMember(actorRole: CommunityRole, targetRole: CommunityRole): boolean {
  return ROLE_ACTION_TRANSITIONS[targetRole]?.includes(actorRole) ?? false
}

/**
 * Whether `actorRole` may ban or unban `targetRole`. Both share one rule: the actor always needs
 * `ban_players`, while the hierarchy only applies while the target is still a member, so
 * non-members and users who left mid-flight remain bannable.
 *
 * Shared by the service-layer validation and the revalidation the database component runs under
 * its locks, so the two cannot drift apart.
 */
export function canBanMember(actorRole: CommunityRole, targetRole: CommunityRole): boolean {
  return hasPermission(actorRole, 'ban_players') && (canActOnMember(actorRole, targetRole) || !isMember(targetRole))
}

/**
 * Whether `actorRole` may move `targetRole` to `newRole`. Ownership is tracked on the community
 * row, so it is never assignable through a role update.
 *
 * Shared by the service-layer validation and the revalidation the database component runs under
 * its locks, so the two cannot drift apart.
 */
export function canUpdateMemberRole(
  actorRole: CommunityRole,
  targetRole: CommunityRole,
  newRole: CommunityRole
): boolean {
  return (
    hasPermission(actorRole, 'assign_roles') && canActOnMember(actorRole, targetRole) && newRole !== CommunityRole.Owner
  )
}

export type OwnedName = {
  id: string
  name: string
  contractAddress: string
  tokenId: string
}

// Community Voice Chat Types
export type CommunityVoiceChat = {
  id: string
  community_id: string
  created_by: string
  status: CommunityVoiceChatStatus
  created_at: Date
  ended_at?: Date
}

export type CommunityVoiceChatParticipant = {
  voice_chat_id: string
  user_address: string
  role: CommunityVoiceChatRole
  joined_at: Date
  left_at?: Date
  is_requesting_to_speak: boolean
}

export enum CommunityVoiceChatStatus {
  ACTIVE = 'active',
  ENDED = 'ended'
}

export enum CommunityVoiceChatRole {
  SPEAKER = 'speaker',
  LISTENER = 'listener'
}

export enum CommunityVoiceChatUpdateStatus {
  STARTED = 'started'
}
