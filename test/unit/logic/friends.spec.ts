import { parseProfilesToFriends } from '../../../src/logic/friends'
import { mockProfile } from '../../mocks/profile'

describe('parseProfilesToFriends', () => {
  it('should convert profile entities to friend users', () => {
    const profileImagesUrl = 'https://profile-images.decentraland.org'
    const anotherProfile = {
      ...mockProfile,
      metadata: {
        ...mockProfile.metadata,
        avatars: [
          {
            ...mockProfile.metadata.avatars[0],
            userId: '0x123aBcDE',
            name: 'TestUser2',
            hasClaimedName: false
          }
        ]
      }
    }
    const profiles = [mockProfile, anotherProfile]

    const result = parseProfilesToFriends(profiles, profileImagesUrl)

    expect(result).toEqual([
      {
        address: '0x123',
        name: 'TestUser',
        hasClaimedName: true,
        profilePictureUrl: `${profileImagesUrl}/entities/${mockProfile.id}/face.png`
      },
      {
        address: '0x123abcde',
        name: 'TestUser2',
        hasClaimedName: false,
        profilePictureUrl: `${profileImagesUrl}/entities/${anotherProfile.id}/face.png`
      }
    ])
  })
})
