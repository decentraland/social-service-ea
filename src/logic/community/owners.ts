import { EthAddress } from '@dcl/schemas'
import { AppComponents } from '../../types'
import { ICommunityOwnersComponent } from './types'
import { CommunityOwnerNotFoundError } from './errors'
import { getProfileName } from '../profiles'

export function createCommunityOwnersComponent(
  components: Pick<AppComponents, 'catalystClient' | 'redis'>
): ICommunityOwnersComponent {
  const { catalystClient, redis } = components

  async function getOwnerName(ownerAddress: EthAddress, communityId: string = 'N/A'): Promise<string> {
    const cacheKey: string = `catalyst:profile:name:${ownerAddress}`
    const cachedName: string | null = await redis.get(cacheKey)

    if (cachedName) {
      return cachedName
    }

    const ownerProfile = await catalystClient.getProfile(ownerAddress)

    if (!ownerProfile) {
      throw new CommunityOwnerNotFoundError(communityId, ownerAddress)
    }

    const fetchedName: string = getProfileName(ownerProfile)

    await redis.put(cacheKey, fetchedName, {
      EX: 60 * 10 // 10 minutes
    })

    return fetchedName
  }

  return {
    getOwnerName
  }
}
