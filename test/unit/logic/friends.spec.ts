import { Entity } from '@dcl/schemas'
import { parseProfilesToFriends } from '../../../src/logic/friends'
import { normalizeAddress } from '../../../src/utils/address'
import { mockProfile } from '../../mocks/profile'

describe('parseProfilesToFriends', () => {
  it('should convert profile entities to friend users', () => {
    const contentServerUrl = 'https://peer.decentraland.org'
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

    const result = parseProfilesToFriends(profiles, contentServerUrl)

    expect(result).toEqual([
      {
        address: '0x123',
        name: 'TestUser',
        hasClaimedName: true,
        profilePictureUrl: 'https://peer.decentraland.org/contents/bafybeiasdfqwer'
      },
      {
        address: '0x123abcde',
        name: 'TestUser2',
        hasClaimedName: false,
        profilePictureUrl: 'https://peer.decentraland.org/contents/bafybeiasdfqwer'
      }
    ])
  })
})
