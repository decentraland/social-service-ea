import { EthAddress } from '@dcl/schemas'
import { AppComponents } from '../../types'
import { ICommunityOwnersComponent } from './types'
import { CommunityOwnerNotFoundError } from './errors'
import { getProfileName } from '../profiles'

export function createCommunityOwnersComponent(
  components: Pick<AppComponents, 'catalystClient'>
): ICommunityOwnersComponent {
  const { catalystClient } = components

  async function getOwnerName(ownerAddress: EthAddress, communityId: string = 'N/A'): Promise<string> {
    const ownerProfile = await catalystClient.getProfile(ownerAddress)

    // TODO: Prevent breaking communities retrieval flow when owner profile is not found
    if (!ownerProfile) {
      throw new CommunityOwnerNotFoundError(communityId, ownerAddress)
    }

    const fetchedName: string = getProfileName(ownerProfile)

    return fetchedName
  }

  return {
    getOwnerName
  }
}
