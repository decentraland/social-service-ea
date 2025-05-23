export type CommunityPermission =
  | 'edit_info'
  | 'add_remove_places'
  | 'accept_reject_requests'
  | 'ban_players'
  | 'send_invitations'
  | 'edit_settings'
  | 'delete_community'
  | 'assign_roles'

export type CommunityRole = 'owner' | 'moderator' | 'member'

export interface CommunityRolePermissions {
  name: CommunityRole
  permissions: CommunityPermission[]
}

export const COMMUNITY_ROLES: Record<CommunityRole, CommunityRolePermissions> = {
  owner: {
    name: 'owner',
    permissions: [
      'edit_info',
      'add_remove_places',
      'accept_reject_requests',
      'ban_players',
      'send_invitations',
      'edit_settings',
      'delete_community',
      'assign_roles'
    ]
  },
  moderator: {
    name: 'moderator',
    permissions: ['edit_info', 'add_remove_places', 'accept_reject_requests', 'ban_players', 'send_invitations']
  },
  member: {
    name: 'member',
    permissions: []
  }
}

export function hasPermission(role: CommunityRole, permission: CommunityPermission): boolean {
  return COMMUNITY_ROLES[role].permissions.includes(permission)
}

export function getRolePermissions(role: CommunityRole): CommunityPermission[] {
  return COMMUNITY_ROLES[role].permissions
}

export function getAllPermissions(): CommunityPermission[] {
  return Object.values(COMMUNITY_ROLES)
    .flatMap((role) => role.permissions)
    .filter((permission, index, self) => self.indexOf(permission) === index) // Remove duplicates
}
