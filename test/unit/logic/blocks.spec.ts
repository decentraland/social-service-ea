import { parseProfilesToBlockedUsers, parseProfileToBlockedUser } from '../../../src/logic/blocks'
import { mockProfile } from '../../mocks/profile'

describe('parseProfileToBlockedUser', () => {
  it('should parse profile to blocked user', () => {
    const blockedAt = new Date()
    const blockedUser = parseProfileToBlockedUser(mockProfile, blockedAt)
    expect(blockedUser).toEqual({
      address: mockProfile.avatars[0].userId,
      name: mockProfile.avatars[0].name,
      hasClaimedName: mockProfile.avatars[0].hasClaimedName,
      profilePictureUrl: mockProfile.avatars[0].avatar.snapshots.face256,
      blockedAt: blockedAt.getTime()
    })
  })
})

describe('parseProfilesToBlockedUsers', () => {
  it('should convert profiles to blocked users', () => {
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
    const blockedAt123 = new Date()
    const blockedAtByAddress = new Map([['0x123', blockedAt123]])
    const result = parseProfilesToBlockedUsers(profiles, blockedAtByAddress)

    expect(result).toEqual([
      {
        address: '0x123',
        name: 'TestUser',
        hasClaimedName: true,
        profilePictureUrl: mockProfile.avatars[0].avatar.snapshots.face256,
        blockedAt: blockedAt123.getTime()
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
