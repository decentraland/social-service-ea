import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import {
  getProfileAvatarItem,
  getProfileName,
  getProfileUserId,
  getProfilePictureUrl,
  getProfileInfo,
  extractMinimalProfile
} from '../../../src/logic/profiles'
import { mockProfile } from '../../mocks/profile'

describe('when extracting profile avatar item', () => {
  let validProfile: Profile

  beforeEach(() => {
    validProfile = mockProfile
  })

  describe('and the profile has avatars', () => {
    it('should return the first avatar', () => {
      const avatar = getProfileAvatarItem(validProfile)
      expect(avatar).toEqual(validProfile.avatars[0])
    })
  })

  describe('and the profile has no avatars', () => {
    let emptyProfile: Profile

    beforeEach(() => {
      emptyProfile = {
        ...validProfile,
        avatars: []
      }
    })

    it('should throw an error', () => {
      expect(() => getProfileAvatarItem(emptyProfile)).toThrow('Missing profile avatar')
    })
  })
})

describe('when extracting profile name', () => {
  let validProfile: Profile

  beforeEach(() => {
    validProfile = mockProfile
  })

  describe('and the profile has a name', () => {
    it('should return the avatar name', () => {
      const name = getProfileName(validProfile)
      expect(name).toEqual(validProfile.avatars[0].name)
    })
  })

  describe('and the profile has no name or unclaimedName', () => {
    let profileWithoutName: Profile

    beforeEach(() => {
      profileWithoutName = {
        ...validProfile,
        avatars: [
          {
            ...validProfile.avatars[0],
            name: undefined,
            unclaimedName: undefined
          }
        ]
      }
    })

    it('should throw an error', () => {
      expect(() => getProfileName(profileWithoutName)).toThrow('Missing profile avatar name')
    })
  })
})

describe('when extracting profile user ID', () => {
  let validProfile: Profile

  beforeEach(() => {
    validProfile = mockProfile
  })

  describe('and the profile has a user ID', () => {
    it('should return the normalized user ID', () => {
      const userId = getProfileUserId(validProfile)
      expect(userId).toEqual(validProfile.avatars[0].userId)
    })
  })

  describe('and the profile has no user ID', () => {
    let profileWithoutUserId: Profile

    beforeEach(() => {
      profileWithoutUserId = {
        ...validProfile,
        avatars: [
          {
            ...validProfile.avatars[0],
            userId: undefined
          }
        ]
      }
    })

    it('should throw an error', () => {
      expect(() => getProfileUserId(profileWithoutUserId)).toThrow('Missing profile avatar userId')
    })
  })
})

describe('when extracting profile picture URL', () => {
  let validProfile: Profile

  beforeEach(() => {
    validProfile = mockProfile
  })

  describe('and the profile has avatar snapshots', () => {
    it('should return the face256 snapshot URL', () => {
      const url = getProfilePictureUrl(validProfile)
      expect(url).toBe(validProfile.avatars[0].avatar.snapshots.face256)
    })
  })

  describe('and the profile has no avatar snapshots', () => {
    let profileWithoutSnapshots: Profile

    beforeEach(() => {
      profileWithoutSnapshots = {
        ...validProfile,
        avatars: [
          {
            ...validProfile.avatars[0],
            avatar: {
              ...validProfile.avatars[0].avatar,
              snapshots: undefined
            }
          }
        ]
      }
    })

    it('should throw an error', () => {
      expect(() => getProfilePictureUrl(profileWithoutSnapshots)).toThrow('Missing profile avatar picture url')
    })
  })
})

describe('when extracting profile info', () => {
  let validProfile: Profile

  beforeEach(() => {
    validProfile = mockProfile
  })

  describe('and the profile is valid', () => {
    it('should return all profile information', () => {
      const info = getProfileInfo(validProfile)
      expect(info).toEqual({
        name: validProfile.avatars[0].name,
        userId: validProfile.avatars[0].userId,
        hasClaimedName: validProfile.avatars[0].hasClaimedName,
        profilePictureUrl: validProfile.avatars[0].avatar.snapshots.face256
      })
    })
  })
})

describe('when extracting minimal profile', () => {
  let validProfile: Profile

  beforeEach(() => {
    validProfile = mockProfile
  })

  describe('and the profile is valid', () => {
    it('should extract minimal profile with only essential properties', () => {
      const minimalProfile = extractMinimalProfile(validProfile)

      expect(minimalProfile).toEqual({
        avatars: [
          {
            userId: validProfile.avatars[0].userId,
            name: validProfile.avatars[0].name,
            unclaimedName: validProfile.avatars[0].unclaimedName,
            hasClaimedName: validProfile.avatars[0].hasClaimedName,
            avatar: {
              snapshots: {
                face256: validProfile.avatars[0].avatar.snapshots.face256
              }
            }
          }
        ]
      })
    })
  })

  describe('and the profile has no avatars', () => {
    let emptyProfile: Profile

    beforeEach(() => {
      emptyProfile = {
        ...validProfile,
        avatars: []
      }
    })

    it('should return null', () => {
      const result = extractMinimalProfile(emptyProfile)
      expect(result).toBeNull()
    })
  })

  describe('and the profile has no user ID', () => {
    let profileWithoutUserId: Profile

    beforeEach(() => {
      profileWithoutUserId = {
        ...validProfile,
        avatars: [
          {
            ...validProfile.avatars[0],
            userId: undefined
          }
        ]
      }
    })

    it('should return null', () => {
      const result = extractMinimalProfile(profileWithoutUserId)
      expect(result).toBeNull()
    })
  })

  describe('and the profile has no name or unclaimedName', () => {
    let profileWithoutName: Profile

    beforeEach(() => {
      profileWithoutName = {
        ...validProfile,
        avatars: [
          {
            ...validProfile.avatars[0],
            name: undefined,
            unclaimedName: undefined
          }
        ]
      }
    })

    it('should return null', () => {
      const result = extractMinimalProfile(profileWithoutName)
      expect(result).toBeNull()
    })
  })

  describe('and the profile has no face256 snapshot', () => {
    let profileWithoutSnapshots: Profile

    beforeEach(() => {
      profileWithoutSnapshots = {
        ...validProfile,
        avatars: [
          {
            ...validProfile.avatars[0],
            avatar: {
              ...validProfile.avatars[0].avatar,
              snapshots: {
                ...validProfile.avatars[0].avatar.snapshots,
                face256: undefined
              }
            }
          }
        ]
      }
    })

    it('should return null', () => {
      const result = extractMinimalProfile(profileWithoutSnapshots)
      expect(result).toBeNull()
    })
  })

  describe('and the profile has only unclaimedName', () => {
    let profileWithUnclaimedName: Profile

    beforeEach(() => {
      profileWithUnclaimedName = {
        ...validProfile,
        avatars: [
          {
            ...validProfile.avatars[0],
            name: undefined,
            unclaimedName: 'testname'
          }
        ]
      }
    })

    it('should return minimal profile with unclaimedName', () => {
      const result = extractMinimalProfile(profileWithUnclaimedName)
      expect(result).not.toBeNull()
      expect(result?.avatars[0].name).toBeUndefined()
      expect(result?.avatars[0].unclaimedName).toBe('testname')
    })
  })

  describe('and the profile has hasClaimedName undefined', () => {
    let profileWithoutHasClaimedName: Profile

    beforeEach(() => {
      profileWithoutHasClaimedName = {
        ...validProfile,
        avatars: [
          {
            ...validProfile.avatars[0],
            hasClaimedName: undefined
          }
        ]
      }
    })

    it('should return minimal profile with hasClaimedName defaulting to false', () => {
      const result = extractMinimalProfile(profileWithoutHasClaimedName)
      expect(result).not.toBeNull()
      expect(result?.avatars[0].hasClaimedName).toBe(false)
    })
  })
})
