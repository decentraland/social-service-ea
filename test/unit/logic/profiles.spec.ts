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
  const baseUrl = 'https://profile-images.decentraland.org'

  it('should construct correct profile picture URL', () => {
    const url = getProfilePictureUrl(baseUrl, mockProfile)

    expect(url).toBe(`${baseUrl}/entities/${mockProfile.id}/face.png`)
  })

  it('should throw on empty baseUrl', () => {
    expect(() => getProfilePictureUrl('', mockProfile)).toThrow('Missing baseUrl')
  })
})
