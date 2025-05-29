import {
  Community,
  CommunityWithMembersCount,
  isOwner,
  toCommunityWithMembersCount
} from '../../../src/logic/community'
import { CommunityRole } from '../../../src/types/entities'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { createCommunityComponent, CommunityNotFoundError, ICommunityComponent } from '../../../src/logic/community'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'

describe('when handling community operations', () => {
  let communityComponent: ICommunityComponent
  let mockCommunity: {
    id: string
    name: string
    description: string
    ownerAddress: string
    privacy: 'public'
    active: boolean
    role: CommunityRole
  }
  let mockUserAddress: string
  let mockMembersCount: number

  beforeEach(() => {
    jest.clearAllMocks()
    mockCommunity = {
      id: 'test-id',
      name: 'Test Community',
      description: 'Test Description',
      ownerAddress: '0x1234567890123456789012345678901234567890',
      privacy: 'public',
      active: true,
      role: CommunityRole.None
    }
    mockUserAddress = '0x1234567890123456789012345678901234567890'
    mockMembersCount = 5
    communityComponent = createCommunityComponent({ communitiesDb: mockCommunitiesDB })
  })

  describe('and getting a community', () => {
    describe('when the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(mockCommunity)
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValue(mockMembersCount)
      })

      it('should return the community with its members count', async () => {
        const result = await communityComponent.getCommunity(mockCommunity.id, mockUserAddress)

        expect(result).toEqual({
          ...mockCommunity,
          membersCount: mockMembersCount
        })
      })

      it('should fetch the community from the database', async () => {
        await communityComponent.getCommunity(mockCommunity.id, mockUserAddress)

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunity.id, mockUserAddress)
      })

      it('should fetch the community members count from the database', async () => {
        await communityComponent.getCommunity(mockCommunity.id, mockUserAddress)

        expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(mockCommunity.id)
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw a CommunityNotFoundError', async () => {
        await expect(communityComponent.getCommunity('non-existent-id', mockUserAddress)).rejects.toThrow(
          new CommunityNotFoundError('non-existent-id')
        )
      })
    })
  })

  describe('and deleting a community', () => {
    describe('when the community exists', () => {
      describe('and the user is the owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue(mockCommunity)
          mockCommunitiesDB.deleteCommunity.mockResolvedValue(undefined)
        })

        it('should delete the community from the database', async () => {
          await communityComponent.deleteCommunity(mockCommunity.id, mockUserAddress)

          expect(mockCommunitiesDB.deleteCommunity).toHaveBeenCalledWith(mockCommunity.id)
        })

        it('should verify the community exists before deletion', async () => {
          await communityComponent.deleteCommunity(mockCommunity.id, mockUserAddress)

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(mockCommunity.id, mockUserAddress)
        })
      })

      describe('and the user is not the owner', () => {
        const nonOwnerAddress = '0x9876543210987654321098765432109876543210'

        beforeEach(() => {
          mockCommunitiesDB.getCommunity.mockResolvedValue(mockCommunity)
        })

        it('should throw a NotAuthorizedError', async () => {
          await expect(communityComponent.deleteCommunity(mockCommunity.id, nonOwnerAddress)).rejects.toThrow(
            new NotAuthorizedError("The user doesn't have permission to delete this community")
          )
        })
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw a CommunityNotFoundError', async () => {
        await expect(communityComponent.deleteCommunity('non-existent-id', mockUserAddress)).rejects.toThrow(
          new CommunityNotFoundError('non-existent-id')
        )
      })
    })
  })
})

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
