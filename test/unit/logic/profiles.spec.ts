import { Entity } from '@dcl/schemas'
import { getProfileAvatar, getProfilePictureUrl } from '../../../src/logic/profiles'
import { mockProfile } from '../../mocks/profile'

describe('getProfileAvatar', () => {
  it('should extract avatar information from profile entity', () => {
    const avatar = getProfileAvatar(mockProfile)

    expect(avatar).toEqual({
      userId: '0x123',
      name: 'TestUser',
      hasClaimedName: true,
      snapshots: {
        face256: 'bafybeiasdfqwer'
      }
    })
  })

  it('should handle profile without avatars gracefully', () => {
    const emptyProfile: Entity = {
      ...mockProfile,
      metadata: {
        avatars: []
      }
    }

    expect(() => getProfileAvatar(emptyProfile)).toThrow('Missing profile avatar')
  })
})

describe('getProfilePictureUrl', () => {
  const baseUrl = 'https://peer.dcl.local/content'

  it('should construct correct profile picture URL', () => {
    const url = getProfilePictureUrl(baseUrl, mockProfile)

    expect(url).toBe('https://peer.dcl.local/content/contents/bafybeiasdfqwer')
  })

  it('should handle missing avatar data gracefully', () => {
    const emptyProfile: Entity = {
      ...mockProfile,
      metadata: {
        avatars: []
      }
    }

    expect(() => getProfilePictureUrl(baseUrl, emptyProfile)).toThrow('Missing profile avatar')
  })

  it('should handle missing snapshots data', () => {
    const profileWithoutSnapshot: Entity = {
      ...mockProfile,
      metadata: {
        avatars: [
          {
            userId: '0x123',
            name: 'TestUser',
            hasClaimedName: true,
            snapshots: {}
          }
        ]
      }
    }

    expect(() => getProfilePictureUrl(baseUrl, profileWithoutSnapshot)).toThrow(
      'Missing snapshot hash for profile picture'
    )
  })

  it('should throw on empty baseUrl', () => {
    expect(() => getProfilePictureUrl('', mockProfile)).toThrow('Missing baseUrl')
  })
})
