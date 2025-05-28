import { CommunityRole, CommunityPermission } from '../types/entities'

export const COMMUNITY_ROLES: Record<CommunityRole, CommunityPermission[]> = {
  [CommunityRole.Owner]: [
    'edit_info',
    'add_remove_places',
    'accept_reject_requests',
    'ban_players',
    'send_invitations',
    'edit_settings',
    'delete_community',
    'assign_roles'
  ],
  [CommunityRole.Moderator]: [
    'edit_info',
    'add_remove_places',
    'accept_reject_requests',
    'ban_players',
    'send_invitations'
  ],
  [CommunityRole.Member]: [],
  [CommunityRole.None]: []
}

export function hasPermission(role: CommunityRole, permission: CommunityPermission): boolean {
  return COMMUNITY_ROLES[role].includes(permission)
}

export function getRolePermissions(role: CommunityRole): CommunityPermission[] {
  return COMMUNITY_ROLES[role] ?? []
}
