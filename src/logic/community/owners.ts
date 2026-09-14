import { EthAddress } from '@dcl/schemas'
import { AppComponents } from '../../types'
import { ICommunityOwnersComponent } from './types'
import { CommunityOwnerNotFoundError } from './errors'
import { getProfileName, getProfileUserId } from '../profiles'

export function createCommunityOwnersComponent(components: Pick<AppComponents, 'registry'>): ICommunityOwnersComponent {
  const { registry } = components

  async function getOwnerName(ownerAddress: EthAddress, communityId: string = 'N/A'): Promise<string> {
    const ownerProfile = await registry.getProfile(ownerAddress)

    // TODO: Prevent breaking communities retrieval flow when owner profile is not found
    if (!ownerProfile) {
      throw new CommunityOwnerNotFoundError(communityId, ownerAddress)
    }

    const fetchedName: string = getProfileName(ownerProfile)

    return fetchedName
  }

  async function getOwnersNames(ownerAddresses: EthAddress[]): Promise<Record<EthAddress, string>> {
    const ownersProfiles = await registry.getProfiles(ownerAddresses)

    return ownersProfiles.reduce(
      (acc, profile) => {
        try {
          const userId = getProfileUserId(profile)
          const name = getProfileName(profile)
          acc[userId] = name
        } catch (error) {
          // Skip profiles that can't be processed (missing avatars, names, etc.)
          // This ensures the function doesn't fail completely when some profiles are invalid
        }
        return acc
      },
      {} as Record<EthAddress, string>
    )
  }

  return {
    getOwnerName,
    getOwnersNames
  }
}
