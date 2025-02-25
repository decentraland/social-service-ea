import { parseProfilesToFriends, parseProfileToFriend } from '../../../src/logic/friends'
import { mockProfile } from '../../mocks/profile'

describe('parseProfileToFriend', () => {
  it('should parse profile to friend', () => {
    const friend = parseProfileToFriend(mockProfile)
    expect(friend).toEqual({
      address: mockProfile.avatars[0].userId,
      name: mockProfile.avatars[0].name,
      hasClaimedName: mockProfile.avatars[0].hasClaimedName,
      profilePictureUrl: mockProfile.avatars[0].avatar.snapshots.face256
    })
  })

  describe('when profile avatar is missing', () => {
    const profileWithoutAvatars = { ...mockProfile, avatars: [] }

    it('should return empty string for name if profile is missing', () => {
      const friend = parseProfileToFriend(profileWithoutAvatars)
      expect(friend.name).toEqual('')
    })

    it('should return empty string for userId if profile is missing', () => {
      const friend = parseProfileToFriend(profileWithoutAvatars)
      expect(friend.address).toEqual('')
    })

    it('should return false for hasClaimedName if profile is missing', () => {
      const friend = parseProfileToFriend(profileWithoutAvatars)
      expect(friend.hasClaimedName).toEqual(false)
    })

    it('should return empty string for profilePictureUrl if profile is missing', () => {
      const friend = parseProfileToFriend(profileWithoutAvatars)
      expect(friend.profilePictureUrl).toEqual('')
    })
  })
})

describe('parseProfilesToFriends', () => {
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

    const result = parseProfilesToFriends(profiles)

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
