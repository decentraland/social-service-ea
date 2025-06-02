import {
  Community,
  CommunityWithMembersCount,
  isOwner,
  toCommunityWithMembersCount,
  toCommunityWithUserInformation,
  toCommunityResults,
  toPublicCommunity,
  CommunityPublicInformation
} from '../../../src/logic/community'
import { CommunityRole } from '../../../src/types/entities'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { createCommunityComponent, CommunityNotFoundError, ICommunityComponent } from '../../../src/logic/community'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockCatalystClient } from '../../mocks/components/catalyst-client'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { createMockProfile } from '../../mocks/profile'
import { CommunityWithMembersCountAndFriends } from '../../../src/logic/community/types'
import { parseExpectedFriends } from '../../mocks/friend'
import { MemberCommunity } from '../../../src/logic/community/types'

describe('when handling community operations', () => {
  let communityComponent: ICommunityComponent
  let mockCommunity: Community
  let mockUserAddress: string
  let mockMembersCount: number

  beforeEach(() => {
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
    communityComponent = createCommunityComponent({
      communitiesDb: mockCommunitiesDB,
      catalystClient: mockCatalystClient
    })
  })

  describe('and getting communities', () => {
    const mockCommunities = [
      {
        ...mockCommunity,
        membersCount: 5,
        friends: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222']
      },
      {
        ...mockCommunity,
        id: 'test-id-2',
        membersCount: 3,
        friends: ['0x3333333333333333333333333333333333333333']
      }
    ]

    const mockProfiles: Profile[] = [
      createMockProfile('0x1111111111111111111111111111111111111111'),
      createMockProfile('0x2222222222222222222222222222222222222222')
    ]

    beforeEach(() => {
      mockCommunitiesDB.getCommunities.mockResolvedValue(mockCommunities)
      mockCommunitiesDB.getCommunitiesCount.mockResolvedValue(2)
      mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
    })

    it('should return communities with friends profiles', async () => {
      const result = await communityComponent.getCommunities(mockUserAddress, { pagination: { limit: 10, offset: 0 } })

      expect(result).toEqual({
        communities: expect.arrayContaining([
          expect.objectContaining({
            ...mockCommunities[0],
            friends: mockProfiles.map(parseExpectedFriends())
          }),
          expect.objectContaining({
            ...mockCommunities[1],
            friends: []
          })
        ]),
        total: 2
      })
    })

    it('should fetch communities and total count from the database', async () => {
      await communityComponent.getCommunities(mockUserAddress, {
        pagination: { limit: 10, offset: 0 },
        onlyMemberOf: false,
        search: 'test'
      })

      expect(mockCommunitiesDB.getCommunities).toHaveBeenCalledWith(mockUserAddress, {
        pagination: { limit: 10, offset: 0 },
        search: 'test',
        onlyMemberOf: false
      })

      expect(mockCommunitiesDB.getCommunitiesCount).toHaveBeenCalledWith(mockUserAddress, {
        pagination: { limit: 10, offset: 0 },
        search: 'test',
        onlyMemberOf: false
      })
    })

    it('should fetch friend profiles from catalyst', async () => {
      await communityComponent.getCommunities(mockUserAddress, { pagination: { limit: 10, offset: 0 } })

      expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333'
      ])
    })
  })

  describe('and getting public communities', () => {
    const mockPublicCommunities: CommunityPublicInformation[] = [
      {
        id: 'test-id',
        name: 'Test Community',
        description: 'Test Description',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        privacy: 'public',
        active: true,
        membersCount: 5,
        isLive: false
      },
      {
        id: 'test-id-2',
        name: 'Test Community 2',
        description: 'Test Description 2',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        privacy: 'public',
        active: true,
        membersCount: 3,
        isLive: false
      }
    ]

    beforeEach(() => {
      mockCommunitiesDB.getCommunitiesPublicInformation.mockResolvedValue(mockPublicCommunities)
      mockCommunitiesDB.getPublicCommunitiesCount.mockResolvedValue(2)
    })

    it('should return public communities', async () => {
      const result = await communityComponent.getCommunitiesPublicInformation({ pagination: { limit: 10, offset: 0 } })

      expect(result).toEqual({
        communities: expect.arrayContaining([
          expect.objectContaining({
            ...mockPublicCommunities[0],
            membersCount: 5,
            isLive: false
          }),
          expect.objectContaining({
            ...mockPublicCommunities[1],
            membersCount: 3,
            isLive: false
          })
        ]),
        total: 2
      })
    })

    it('should fetch public communities from the database', async () => {
      await communityComponent.getCommunitiesPublicInformation({ pagination: { limit: 10, offset: 0 } })

      expect(mockCommunitiesDB.getCommunitiesPublicInformation).toHaveBeenCalledWith({
        pagination: { limit: 10, offset: 0 }
      })
    })

    it('should fetch the total count from the database', async () => {
      await communityComponent.getCommunitiesPublicInformation({ pagination: { limit: 10, offset: 0 } })

      expect(mockCommunitiesDB.getPublicCommunitiesCount).toHaveBeenCalledWith({})
    })

    it('should handle search parameter', async () => {
      await communityComponent.getCommunitiesPublicInformation({
        pagination: { limit: 10, offset: 0 },
        search: 'test'
      })

      expect(mockCommunitiesDB.getCommunitiesPublicInformation).toHaveBeenCalledWith({
        pagination: { limit: 10, offset: 0 },
        search: 'test'
      })
      expect(mockCommunitiesDB.getPublicCommunitiesCount).toHaveBeenCalledWith({ search: 'test' })
    })
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

  describe('and getting member communities', () => {
    const mockMemberCommunities: MemberCommunity[] = [
      {
        id: 'test-id-1',
        name: 'Test Community 1',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        role: CommunityRole.Owner
      },
      {
        id: 'test-id-2',
        name: 'Test Community 2',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        role: CommunityRole.Moderator
      },
      {
        id: 'test-id-3',
        name: 'Test Community 3',
        ownerAddress: '0x9876543210987654321098765432109876543210',
        role: CommunityRole.Member
      }
    ]

    beforeEach(() => {
      mockCommunitiesDB.getMemberCommunities.mockResolvedValue(mockMemberCommunities)
      mockCommunitiesDB.getCommunitiesCount.mockResolvedValue(3)
    })

    it('should return member communities with total count', async () => {
      const result = await communityComponent.getMemberCommunities(mockUserAddress, {
        pagination: { limit: 10, offset: 0 }
      })

      expect(result).toEqual({
        communities: mockMemberCommunities,
        total: 3
      })
    })

    it('should fetch member communities from the database', async () => {
      await communityComponent.getMemberCommunities(mockUserAddress, {
        pagination: { limit: 10, offset: 0 }
      })

      expect(mockCommunitiesDB.getMemberCommunities).toHaveBeenCalledWith(mockUserAddress, {
        pagination: { limit: 10, offset: 0 }
      })
    })

    it('should fetch the total count from the database with onlyMemberOf flag', async () => {
      await communityComponent.getMemberCommunities(mockUserAddress, {
        pagination: { limit: 10, offset: 0 }
      })

      expect(mockCommunitiesDB.getCommunitiesCount).toHaveBeenCalledWith(mockUserAddress, {
        onlyMemberOf: true
      })
    })

    it('should handle pagination correctly', async () => {
      await communityComponent.getMemberCommunities(mockUserAddress, {
        pagination: { limit: 2, offset: 1 }
      })

      expect(mockCommunitiesDB.getMemberCommunities).toHaveBeenCalledWith(mockUserAddress, {
        pagination: { limit: 2, offset: 1 }
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

  describe('toCommunityResult', () => {
    const mockCommunity: CommunityWithMembersCountAndFriends = {
      id: 'test-id',
      name: 'Test Community',
      description: 'Test Description',
      ownerAddress: '0x1234567890123456789012345678901234567890',
      privacy: 'public',
      active: true,
      role: CommunityRole.None,
      membersCount: 5,
      friends: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222']
    }

    const mockProfiles: Profile[] = [
      createMockProfile('0x1111111111111111111111111111111111111111'),
      createMockProfile('0x2222222222222222222222222222222222222222')
    ]

    it('should convert community with friends to CommunityWithUserInformation', () => {
      const profilesMap = new Map(mockProfiles.map((profile) => [profile.avatars[0].userId, profile]))
      const result = toCommunityWithUserInformation(mockCommunity, profilesMap)

      expect(result).toEqual({
        ...mockCommunity,
        friends: [parseExpectedFriends()(mockProfiles[0]), parseExpectedFriends()(mockProfiles[1])],
        isLive: false
      })
    })

    it('should handle missing friend profiles', () => {
      const profilesMap = new Map([[mockProfiles[0].avatars[0].userId, mockProfiles[0]]])
      const result = toCommunityWithUserInformation(mockCommunity, profilesMap)

      expect(result.friends).toHaveLength(1)
      expect(result.friends[0].address).toBe('0x1111111111111111111111111111111111111111')
    })
  })

  describe('toCommunityResults', () => {
    const mockCommunities: CommunityWithMembersCountAndFriends[] = [
      {
        id: 'test-id-1',
        name: 'Test Community 1',
        description: 'Test Description 1',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        privacy: 'public',
        active: true,
        role: CommunityRole.None,
        membersCount: 5,
        friends: ['0x1111111111111111111111111111111111111111']
      },
      {
        id: 'test-id-2',
        name: 'Test Community 2',
        description: 'Test Description 2',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        privacy: 'public',
        active: true,
        role: CommunityRole.None,
        membersCount: 3,
        friends: ['0x2222222222222222222222222222222222222222']
      }
    ]

    const mockProfiles: Profile[] = [
      createMockProfile('0x1111111111111111111111111111111111111111'),
      createMockProfile('0x2222222222222222222222222222222222222222')
    ]

    it('should convert multiple communities with friends to CommunityResults', () => {
      const results = toCommunityResults(mockCommunities, mockProfiles)

      expect(results).toHaveLength(2)
      expect(results[0].friends).toHaveLength(1)
      expect(results[0].friends[0]).toEqual(parseExpectedFriends()(mockProfiles[0]))
      expect(results[1].friends).toHaveLength(1)
      expect(results[1].friends[0]).toEqual(parseExpectedFriends()(mockProfiles[1]))
    })

    it('should handle empty friends array', () => {
      const communitiesWithNoFriends = mockCommunities.map((c) => ({ ...c, friends: [] }))
      const results = toCommunityResults(communitiesWithNoFriends, mockProfiles)

      expect(results).toHaveLength(2)
      expect(results[0].friends).toHaveLength(0)
      expect(results[1].friends).toHaveLength(0)
    })
  })

  describe('toPublicCommunity', () => {
    const mockPublicCommunity: CommunityPublicInformation = {
      id: 'test-id',
      name: 'Test Community',
      description: 'Test Description',
      ownerAddress: '0x1234567890123456789012345678901234567890',
      privacy: 'public',
      active: true,
      membersCount: 5,
      isLive: false
    }

    it('should convert community to PublicCommunity', () => {
      const result = toPublicCommunity(mockPublicCommunity)

      expect(result).toEqual({
        ...mockPublicCommunity,
        membersCount: 5,
        isLive: false
      })
    })

    it('should handle string membersCount by converting to number', () => {
      const communityWithStringCount = {
        ...mockPublicCommunity,
        membersCount: 10
      }
      const result = toPublicCommunity(communityWithStringCount)

      expect(result).toEqual({
        ...mockPublicCommunity,
        membersCount: 10,
        isLive: false
      })
    })

    it('should preserve all community properties', () => {
      const result = toPublicCommunity(mockPublicCommunity)

      expect(result.id).toBe(mockPublicCommunity.id)
      expect(result.name).toBe(mockPublicCommunity.name)
      expect(result.description).toBe(mockPublicCommunity.description)
      expect(result.ownerAddress).toBe(mockPublicCommunity.ownerAddress)
      expect(result.privacy).toBe(mockPublicCommunity.privacy)
      expect(result.active).toBe(mockPublicCommunity.active)
      expect(result.membersCount).toBe(5)
      expect(result.isLive).toBe(false)
    })
  })
})
