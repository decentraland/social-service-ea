import { CommunityDB } from '../../src/logic/community'

export const mockCommunity = (community: Partial<CommunityDB> = {}): CommunityDB => ({
  ...community,
  name: community.name || 'Mock Community',
  description: community.description || 'Mock Description',
  owner_address: community.owner_address || '0x123',
  private: community.private || false,
  active: community.active || true
})
