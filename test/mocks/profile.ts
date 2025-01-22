import { Entity, EntityType } from '@dcl/schemas'

export const mockProfile: Entity = {
  version: '1',
  id: 'profile-id',
  type: EntityType.PROFILE,
  metadata: {
    avatars: [
      {
        userId: '0x123',
        name: 'TestUser',
        hasClaimedName: true,
        snapshots: {
          face256: 'bafybeiasdfqwer'
        }
      }
    ]
  },
  pointers: ['0x123'],
  timestamp: new Date().getTime(),
  content: [
    {
      file: 'face256',
      hash: 'bafybeiasdfqwer'
    }
  ]
}

export const createMockProfile = (address: string): Entity => ({
  ...mockProfile,
  pointers: [address],
  metadata: {
    ...mockProfile.metadata,
    avatars: [
      {
        ...mockProfile.metadata.avatars[0],
        userId: address,
        name: `Profile name ${address}`,
        hasClaimedName: true
      }
    ]
  }
})
