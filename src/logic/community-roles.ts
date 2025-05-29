import { CommunityRole, CommunityPermission } from '../types/entities'

export const OWNER_PERMISSIONS: CommunityPermission[] = [
  'edit_info',
  'add_places',
  'remove_places',
  'accept_requests',
  'reject_requests',
  'ban_players',
  'send_invitations',
  'edit_settings',
  'delete_community',
  'assign_roles'
]

export const MODERATOR_PERMISSIONS: CommunityPermission[] = [
  'edit_info',
  'add_places',
  'remove_places',
  'accept_requests',
  'reject_requests',
  'ban_players',
  'send_invitations'
]

export const COMMUNITY_ROLES: Record<CommunityRole, CommunityPermission[]> = {
  [CommunityRole.Owner]: OWNER_PERMISSIONS,
  [CommunityRole.Moderator]: MODERATOR_PERMISSIONS,
  [CommunityRole.Member]: [],
  [CommunityRole.None]: []
}

export function hasPermission(role: CommunityRole, permission: CommunityPermission): boolean {
  return COMMUNITY_ROLES[role].includes(permission)
}

export function getRolePermissions(role: CommunityRole): CommunityPermission[] {
  return COMMUNITY_ROLES[role] ?? []
}
