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
