import { parseProfilesToUserProfiles, parseProfileToUserProfile } from '../../../src/logic/friends'
import { mockProfile } from '../../mocks/profile'

describe('parseProfileToUserProfile', () => {
  it('should parse profile to friend', () => {
    const friend = parseProfileToUserProfile(mockProfile)
    expect(friend).toEqual({
      address: mockProfile.avatars[0].userId,
      name: mockProfile.avatars[0].name,
      hasClaimedName: mockProfile.avatars[0].hasClaimedName,
      profilePictureUrl: mockProfile.avatars[0].avatar.snapshots.face256
    })
  })
})

describe('parseProfilesToUserProfiles', () => {
  it('should convert profiles to friend users', () => {
    const anotherProfile = {
      ...mockProfile,
      avatars: [
        {
          ...mockProfile.avatars[0],
          userId: '0x123aBcDE',
          name: 'TestUser2',
          hasClaimedName: false
        }
      ]
    }
    const profiles = [mockProfile, anotherProfile]

    const result = parseProfilesToUserProfiles(profiles)

    expect(result).toEqual([
      {
        address: '0x123',
        name: 'TestUser',
        hasClaimedName: true,
        profilePictureUrl: mockProfile.avatars[0].avatar.snapshots.face256
      },
      {
        address: '0x123abcde',
        name: 'TestUser2',
        hasClaimedName: false,
        profilePictureUrl: anotherProfile.avatars[0].avatar.snapshots.face256
      }
    ])
  })
})
