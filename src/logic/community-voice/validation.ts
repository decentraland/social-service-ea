import { CommunityRole } from '../../types/entities'
import { UserNotCommunityMemberError } from './errors'
import { ICommunitiesDatabaseComponent } from '../../types/components'
import { Community, CommunityPrivacyEnum } from '../community/types'

/**
 * Helper function to validate target user permissions for voice chat operations (promote/demote) based on community privacy
 * @param communitiesDb - Communities database adapter
 * @param community - Community object with privacy information
 * @param communityId - Community ID
 * @param targetUserAddress - Target user address
 * @returns Promise<void> - Throws error if validation fails
 */
export async function validateCommunityVoiceChatTargetUser(
  communitiesDb: ICommunitiesDatabaseComponent,
  community: Community,
  communityId: string,
  targetUserAddress: string
): Promise<void> {
  // Validation logic based on community type
  if (community.privacy === CommunityPrivacyEnum.Private) {
    // For private communities: user must be member AND NOT banned
    const targetUserRole = await communitiesDb.getCommunityMemberRole(communityId, targetUserAddress)

    // User must be a member first
    if (targetUserRole === CommunityRole.None) {
      throw new UserNotCommunityMemberError(targetUserAddress, communityId)
    }

    // If user is a member, check they are not banned
    const isTargetBanned = await communitiesDb.isMemberBanned(communityId, targetUserAddress)
    if (isTargetBanned) {
      throw new UserNotCommunityMemberError(targetUserAddress, communityId)
    }
  } else {
    // For public communities: no restrictions, anyone in voice chat can be promoted/demoted
    // Let comms-gatekeeper validate if user is actually in voice chat
  }
}
