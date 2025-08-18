import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

const PROFILE_IMAGES_URL = 'https://profile-images.decentraland.org'

export const mockProfile: Profile = {
  avatars: [
    {
      userId: '0x123',
      name: 'TestUser',
      hasClaimedName: true,
      avatar: {
        snapshots: {
          face256: `${PROFILE_IMAGES_URL}/entities/bafybeiasdfqwer/face.png`
        }
      }
    }
  ]
}

/**
 * Creates a basic mock profile for an address (legacy function)
 */
export const createMockProfile = (address: string): Profile => ({
  ...mockProfile,
  avatars: [
    {
      ...mockProfile.avatars[0],
      userId: address,
      name: `Profile name ${address}`,
      hasClaimedName: true
    }
  ]
})

/**
 * Creates a comprehensive mock profile with detailed avatar properties
 * Useful for tests that need complete profile data including avatar details
 */
export const createMockProfileWithDetails = (
  address: string, 
  options: {
    name?: string
    hasClaimedName?: boolean
    bodyShape?: string
  } = {}
): Profile => ({
  avatars: [
    {
      userId: address,
      name: options.name || `Profile name ${address}`,
      hasClaimedName: options.hasClaimedName ?? true,
      ethAddress: address,
      description: '',
      avatar: {
        bodyShape: options.bodyShape || 'urn:decentraland:off-chain:base-avatars:BaseMale',
        snapshots: { 
          face256: `${PROFILE_IMAGES_URL}/entities/${address}/face.png`
        },
        eyes: { 
          color: { r: 0.125, g: 0.703125, b: 0.96484375 } 
        },
        hair: { 
          color: { r: 0.234375, g: 0.12890625, b: 0.04296875 } 
        },
        skin: { 
          color: { r: 0.94921875, g: 0.76171875, b: 0.64453125 } 
        }
      }
    }
  ]
})

/**
 * Creates multiple mock profiles for testing community member scenarios
 * Automatically alternates between male/female avatars and generates sequential names
 * 
 * @param addresses - Array of user addresses to create profiles for
 * @param namePrefix - Prefix for generated names (default: 'Member')
 * @returns Array of Profile objects ready to be used in catalyst client mocks
 * 
 * @example
 * // In your test:
 * spyComponents.catalystClient.getProfiles.mockResolvedValue(
 *   createMockProfiles(['0x123...', '0x456...'], 'User')
 * )
 * // Results in: 'User 1', 'User 2', etc.
 */
export const createMockProfiles = (
  addresses: string[], 
  namePrefix: string = 'Member'
): Profile[] => {
  return addresses.map((address, index) => 
    createMockProfileWithDetails(address, {
      name: `${namePrefix} ${index + 1}`,
      hasClaimedName: false,
      bodyShape: index % 2 === 0 
        ? 'urn:decentraland:off-chain:base-avatars:BaseMale'
        : 'urn:decentraland:off-chain:base-avatars:BaseFemale'
    })
  )
}
