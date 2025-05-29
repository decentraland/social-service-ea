import {
  Community,
  CommunityWithMembersCount,
  isOwner,
  toCommunityWithMembersCount
} from '../../../src/logic/community'
import { CommunityRole } from '../../../src/types/entities'

describe('Community Utils', () => {
  describe('isOwner', () => {
    const mockCommunity: Community = {
      id: 'test-id',
      name: 'Test Community',
      description: 'Test Description',
      ownerAddress: '0x1234567890123456789012345678901234567890',
      privacy: 'public',
      active: true,
      role: CommunityRole.None
    }

    it('should return true when user is the owner', () => {
      const userAddress = '0x1234567890123456789012345678901234567890'
      expect(isOwner(mockCommunity, userAddress)).toBe(true)
    })

    it('should return true when user is the owner with different case', () => {
      const userAddress = '0x1234567890123456789012345678901234567890'.toUpperCase()
      expect(isOwner(mockCommunity, userAddress)).toBe(true)
    })

    it('should return false when user is not the owner', () => {
      const userAddress = '0x9876543210987654321098765432109876543210'
      expect(isOwner(mockCommunity, userAddress)).toBe(false)
    })
  })

  describe('toCommunityWithMembersCount', () => {
    const mockCommunity: Community = {
      id: 'test-id',
      name: 'Test Community',
      description: 'Test Description',
      ownerAddress: '0x1234567890123456789012345678901234567890',
      privacy: 'public',
      active: true,
      role: CommunityRole.None
    }

    it('should convert community to CommunityWithMembersCount', () => {
      const membersCount = 5
      const result = toCommunityWithMembersCount(mockCommunity, membersCount)

      const expected: CommunityWithMembersCount = {
        ...mockCommunity,
        ownerAddress: mockCommunity.ownerAddress,
        membersCount: 5
      }

      expect(result).toEqual(expected)
    })

    it('should handle string membersCount by converting to number', () => {
      const membersCount = 10
      const result = toCommunityWithMembersCount(mockCommunity, membersCount)

      const expected: CommunityWithMembersCount = {
        ...mockCommunity,
        ownerAddress: mockCommunity.ownerAddress,
        membersCount: 10
      }

      expect(result).toEqual(expected)
    })

    it('should preserve all community properties', () => {
      const membersCount = 3
      const result = toCommunityWithMembersCount(mockCommunity, membersCount)

      // Check that all original properties are preserved
      expect(result.id).toBe(mockCommunity.id)
      expect(result.name).toBe(mockCommunity.name)
      expect(result.description).toBe(mockCommunity.description)
      expect(result.ownerAddress).toBe(mockCommunity.ownerAddress)
      expect(result.privacy).toBe(mockCommunity.privacy)
      expect(result.active).toBe(mockCommunity.active)
      expect(result.role).toBe(mockCommunity.role)
      expect(result.membersCount).toBe(3)
    })
  })
})
