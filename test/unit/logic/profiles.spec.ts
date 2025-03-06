import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import {
  getProfileAvatarItem,
  getProfileName,
  getProfileUserId,
  getProfilePictureUrl,
  getProfileInfo
} from '../../../src/logic/profiles'
import { mockProfile } from '../../mocks/profile'

describe('getProfileAvatarItem', () => {
  it('should extract avatar information from profile entity', () => {
    const avatar = getProfileAvatarItem(mockProfile)
    expect(avatar).toEqual(mockProfile.avatars[0])
  })

  it('should throw on profile without avatars', () => {
    const emptyProfile: Profile = {
      ...mockProfile,
      avatars: []
    }

    expect(() => getProfileAvatarItem(emptyProfile)).toThrow('Missing profile avatar')
  })
})

describe('getProfileAvatarName', () => {
  it('should extract avatar name from profile entity', () => {
    const name = getProfileName(mockProfile)
    expect(name).toEqual(mockProfile.avatars[0].name)
  })

  it('should throw on profile without name', () => {
    const profileWithoutName: Profile = {
      ...mockProfile,
      avatars: [
        {
          ...mockProfile.avatars[0],
          name: undefined
        }
      ]
    }
    expect(() => getProfileName(profileWithoutName)).toThrow('Missing profile avatar name')
  })
})

describe('getProfileAvatarUserId', () => {
  it('should extract avatar userId from profile entity', () => {
    const userId = getProfileUserId(mockProfile)
    expect(userId).toEqual(mockProfile.avatars[0].userId)
  })

  it('should throw on profile without user id', () => {
    const profileWithoutUserId: Profile = {
      ...mockProfile,
      avatars: [
        {
          ...mockProfile.avatars[0],
          userId: undefined
        }
      ]
    }
    expect(() => getProfileUserId(profileWithoutUserId)).toThrow('Missing profile avatar userId')
  })
})

describe('getProfilePictureUrl', () => {
  it('should construct correct profile picture URL', () => {
    const url = getProfilePictureUrl(mockProfile)
    expect(url).toBe(mockProfile.avatars[0].avatar.snapshots.face256)
  })

  it('should throw on profile without avatar snapshots', () => {
    const profileWithoutSnapshots: Profile = {
      ...mockProfile,
      avatars: [{ ...mockProfile.avatars[0], avatar: { ...mockProfile.avatars[0].avatar, snapshots: undefined } }]
    }
    expect(() => getProfilePictureUrl(profileWithoutSnapshots)).toThrow('Missing profile avatar picture url')
  })
})

describe('getProfileInfo', () => {
  it('should extract profile info from profile entity', () => {
    const info = getProfileInfo(mockProfile)
    expect(info).toEqual({
      name: mockProfile.avatars[0].name,
      userId: mockProfile.avatars[0].userId,
      hasClaimedName: mockProfile.avatars[0].hasClaimedName,
      profilePictureUrl: mockProfile.avatars[0].avatar.snapshots.face256
    })
  })
})
