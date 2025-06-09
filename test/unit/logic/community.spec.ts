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
import {
  CommunityMemberProfile,
  CommunityWithMembersCountAndFriends,
  ICommunityRolesComponent
} from '../../../src/logic/community/types'
import { parseExpectedFriends } from '../../mocks/friend'
import { MemberCommunity } from '../../../src/logic/community/types'
import { createCommunityRolesComponent } from '../../../src/logic/community/roles'
import { mockLogs } from '../../mocks/components'
import { mapMembersWithProfiles } from '../../../src/logic/community/utils'
import { Action } from '../../../src/types/entities'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createMockPeersStatsComponent } from '../../mocks/components'
import { IPeersStatsComponent } from '../../../src/logic/peers-stats'

describe('when handling community operations', () => {
  let communityComponent: ICommunityComponent
  let mockCommunityRoles: ICommunityRolesComponent
  let mockCommunity: Community & { role: CommunityRole }
  let mockUserAddress: string
  let mockMembersCount: number
  let mockPeersStats: jest.Mocked<IPeersStatsComponent>

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
    mockPeersStats = createMockPeersStatsComponent({
      getConnectedPeers: jest.fn().mockResolvedValue([])
    })
    mockCommunityRoles = createCommunityRolesComponent({ communitiesDb: mockCommunitiesDB, logs: mockLogs })
    communityComponent = createCommunityComponent({
      communitiesDb: mockCommunitiesDB,
      catalystClient: mockCatalystClient,
      communityRoles: mockCommunityRoles,
      logs: mockLogs,
      peersStats: mockPeersStats
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

  describe('and kicking a member', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'

    describe('when the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(true)
      })

      describe('and the kicker is the owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow owner to kick a member', async () => {
          await communityComponent.kickMember(communityId, ownerAddress, memberAddress)
          expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, memberAddress)
        })

        it('should allow owner to kick a moderator', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [moderatorAddress]: CommunityRole.Moderator
          })

          await communityComponent.kickMember(communityId, ownerAddress, moderatorAddress)
          expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, moderatorAddress)
        })

        it('should not allow owner to kick another owner', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            ['0xother-owner']: CommunityRole.Owner
          })

          await expect(communityComponent.kickMember(communityId, ownerAddress, '0xother-owner')).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${ownerAddress} doesn't have permission to kick 0xother-owner from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
        })
      })

      describe('and the kicker is a moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow moderator to kick a member', async () => {
          await communityComponent.kickMember(communityId, moderatorAddress, memberAddress)
          expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, memberAddress)
        })

        it('should not allow moderator to kick another moderator', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            ['0xother-moderator']: CommunityRole.Moderator
          })

          await expect(
            communityComponent.kickMember(communityId, moderatorAddress, '0xother-moderator')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to kick 0xother-moderator from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
        })

        it('should not allow moderator to kick an owner', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [ownerAddress]: CommunityRole.Owner
          })

          await expect(communityComponent.kickMember(communityId, moderatorAddress, ownerAddress)).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to kick ${ownerAddress} from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
        })
      })

      describe('and the kicker is a member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            ['0xother-member']: CommunityRole.Member
          })
        })

        it('should not allow member to kick another member', async () => {
          await expect(communityComponent.kickMember(communityId, memberAddress, '0xother-member')).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${memberAddress} doesn't have permission to kick 0xother-member from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
        })
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
      })

      it('should throw a CommunityNotFoundError', async () => {
        await expect(communityComponent.kickMember(communityId, ownerAddress, memberAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
      })
    })
  })

  describe('and banning a member', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'

    describe('when the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
      })

      describe('and the banner is the owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow owner to ban a member', async () => {
          mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(true)
          await communityComponent.banMember(communityId, ownerAddress, memberAddress)
          expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, memberAddress)
          expect(mockCommunitiesDB.banMemberFromCommunity).toHaveBeenCalledWith(
            communityId,
            ownerAddress,
            memberAddress
          )
        })

        it('should allow owner to ban a moderator', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [moderatorAddress]: CommunityRole.Moderator
          })
          mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(true)

          await communityComponent.banMember(communityId, ownerAddress, moderatorAddress)
          expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, moderatorAddress)
          expect(mockCommunitiesDB.banMemberFromCommunity).toHaveBeenCalledWith(
            communityId,
            ownerAddress,
            moderatorAddress
          )
        })

        it('should not allow owner to ban another owner', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            ['0xother-owner']: CommunityRole.Owner
          })

          await expect(communityComponent.banMember(communityId, ownerAddress, '0xother-owner')).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${ownerAddress} doesn't have permission to ban 0xother-owner from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.banMemberFromCommunity).not.toHaveBeenCalled()
        })

        it('should ban non-member without kicking', async () => {
          mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(false)
          await communityComponent.banMember(communityId, ownerAddress, memberAddress)
          expect(mockCommunitiesDB.kickMemberFromCommunity).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.banMemberFromCommunity).toHaveBeenCalledWith(
            communityId,
            ownerAddress,
            memberAddress
          )
        })
      })

      describe('and the banner is a moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow moderator to ban a member', async () => {
          mockCommunitiesDB.isMemberOfCommunity.mockResolvedValue(true)
          await communityComponent.banMember(communityId, moderatorAddress, memberAddress)
          expect(mockCommunitiesDB.kickMemberFromCommunity).toHaveBeenCalledWith(communityId, memberAddress)
          expect(mockCommunitiesDB.banMemberFromCommunity).toHaveBeenCalledWith(
            communityId,
            moderatorAddress,
            memberAddress
          )
        })

        it('should not allow moderator to ban another moderator', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            ['0xother-moderator']: CommunityRole.Moderator
          })

          await expect(
            communityComponent.banMember(communityId, moderatorAddress, '0xother-moderator')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to ban 0xother-moderator from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.banMemberFromCommunity).not.toHaveBeenCalled()
        })

        it('should not allow moderator to ban an owner', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [ownerAddress]: CommunityRole.Owner
          })

          await expect(communityComponent.banMember(communityId, moderatorAddress, ownerAddress)).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to ban ${ownerAddress} from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.banMemberFromCommunity).not.toHaveBeenCalled()
        })
      })

      describe('and the banner is a member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            ['0xother-member']: CommunityRole.Member
          })
        })

        it('should not allow member to ban another member', async () => {
          await expect(communityComponent.banMember(communityId, memberAddress, '0xother-member')).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${memberAddress} doesn't have permission to ban 0xother-member from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.banMemberFromCommunity).not.toHaveBeenCalled()
        })
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
      })

      it('should throw a CommunityNotFoundError', async () => {
        await expect(communityComponent.banMember(communityId, ownerAddress, memberAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.banMemberFromCommunity).not.toHaveBeenCalled()
      })
    })
  })

  describe('and unbanning a member', () => {
    const communityId = 'test-community'
    const ownerAddress = '0xowner'
    const moderatorAddress = '0xmoderator'
    const memberAddress = '0xmember'

    describe('when the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
      })

      describe('and the unbanner is the owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow owner to unban a member', async () => {
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(true)
          await communityComponent.unbanMember(communityId, ownerAddress, memberAddress)
          expect(mockCommunitiesDB.unbanMemberFromCommunity).toHaveBeenCalledWith(
            communityId,
            ownerAddress,
            memberAddress
          )
        })

        it('should allow owner to unban a moderator', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            [moderatorAddress]: CommunityRole.Moderator
          })
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(true)

          await communityComponent.unbanMember(communityId, ownerAddress, moderatorAddress)
          expect(mockCommunitiesDB.unbanMemberFromCommunity).toHaveBeenCalledWith(
            communityId,
            ownerAddress,
            moderatorAddress
          )
        })

        it('should not allow owner to unban another owner', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [ownerAddress]: CommunityRole.Owner,
            ['0xother-owner']: CommunityRole.Owner
          })
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(true)

          await expect(communityComponent.unbanMember(communityId, ownerAddress, '0xother-owner')).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${ownerAddress} doesn't have permission to unban 0xother-owner from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.unbanMemberFromCommunity).not.toHaveBeenCalled()
        })

        it('should return early if member is not banned', async () => {
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(false)
          await communityComponent.unbanMember(communityId, ownerAddress, memberAddress)
          expect(mockCommunitiesDB.unbanMemberFromCommunity).not.toHaveBeenCalled()
        })
      })

      describe('and the unbanner is a moderator', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [memberAddress]: CommunityRole.Member
          })
        })

        it('should allow moderator to unban a member', async () => {
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(true)
          await communityComponent.unbanMember(communityId, moderatorAddress, memberAddress)
          expect(mockCommunitiesDB.unbanMemberFromCommunity).toHaveBeenCalledWith(
            communityId,
            moderatorAddress,
            memberAddress
          )
        })

        it('should not allow moderator to unban another moderator', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            ['0xother-moderator']: CommunityRole.Moderator
          })
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(true)

          await expect(
            communityComponent.unbanMember(communityId, moderatorAddress, '0xother-moderator')
          ).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to unban 0xother-moderator from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.unbanMemberFromCommunity).not.toHaveBeenCalled()
        })

        it('should not allow moderator to unban an owner', async () => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [moderatorAddress]: CommunityRole.Moderator,
            [ownerAddress]: CommunityRole.Owner
          })
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(true)

          await expect(communityComponent.unbanMember(communityId, moderatorAddress, ownerAddress)).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${moderatorAddress} doesn't have permission to unban ${ownerAddress} from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.unbanMemberFromCommunity).not.toHaveBeenCalled()
        })
      })

      describe('and the unbanner is a member', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
            [memberAddress]: CommunityRole.Member,
            ['0xother-member']: CommunityRole.Member
          })
        })

        it('should not allow member to unban another member', async () => {
          mockCommunitiesDB.isMemberBanned.mockResolvedValue(true)
          await expect(communityComponent.unbanMember(communityId, memberAddress, '0xother-member')).rejects.toThrow(
            new NotAuthorizedError(
              `The user ${memberAddress} doesn't have permission to unban 0xother-member from community ${communityId}`
            )
          )

          expect(mockCommunitiesDB.unbanMemberFromCommunity).not.toHaveBeenCalled()
        })
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
      })

      it('should throw a CommunityNotFoundError', async () => {
        await expect(communityComponent.unbanMember(communityId, ownerAddress, memberAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.unbanMemberFromCommunity).not.toHaveBeenCalled()
      })
    })
  })

  describe('and getting community members', () => {
    const communityId = 'test-community'
    const mockMembers = [
      {
        communityId: 'test-community',
        memberAddress: '0x1111111111111111111111111111111111111111',
        role: CommunityRole.Member,
        joinedAt: new Date().toISOString(),
        lastFriendshipAction: Action.REQUEST,
        actingUser: '0x1111111111111111111111111111111111111111'
      },
      {
        communityId: 'test-community',
        memberAddress: '0x2222222222222222222222222222222222222222',
        role: CommunityRole.Moderator,
        joinedAt: new Date().toISOString(),
        lastFriendshipAction: Action.ACCEPT,
        actingUser: '0x2222222222222222222222222222222222222222'
      }
    ]

    const mockProfiles: Profile[] = [
      createMockProfile('0x1111111111111111111111111111111111111111'),
      createMockProfile('0x2222222222222222222222222222222222222222')
    ]

    beforeEach(async () => {
      mockCommunitiesDB.communityExists.mockResolvedValue(true)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      mockCommunitiesDB.getCommunityMembers.mockResolvedValue(mockMembers)
      mockCommunitiesDB.getCommunityMembersCount.mockResolvedValue(2)
      mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
    })

    it('should return members with profiles and friendship status', async () => {
      const result = await communityComponent.getCommunityMembers(communityId, mockUserAddress, {
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(result).toEqual({
        members: expect.arrayContaining([
          expect.objectContaining({
            ...mockMembers[0],
            profilePictureUrl: expect.any(String),
            hasClaimedName: expect.any(Boolean),
            name: expect.any(String),
            friendshipStatus: expect.any(Number)
          }),
          expect.objectContaining({
            ...mockMembers[1],
            profilePictureUrl: expect.any(String),
            hasClaimedName: expect.any(Boolean),
            name: expect.any(String),
            friendshipStatus: expect.any(Number)
          })
        ]),
        totalMembers: 2
      })
    })

    it('should fetch members and total count from the database', async () => {
      await communityComponent.getCommunityMembers(communityId, mockUserAddress, {
        pagination: {
          limit: 10,
          offset: 0
        }
      })
      expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
        userAddress: mockUserAddress,
        pagination: {
          limit: 10,
          offset: 0
        },
        onlinePeers: []
      })
      expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(communityId, { onlinePeers: [] })
    })

    it('should fetch profiles from catalyst', async () => {
      await communityComponent.getCommunityMembers(communityId, mockUserAddress, {
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(mockMembers.map((member) => member.memberAddress))
    })

    it('should throw CommunityNotFoundError when community does not exist', async () => {
      mockCommunitiesDB.communityExists.mockResolvedValue(false)

      await expect(
        communityComponent.getCommunityMembers(communityId, mockUserAddress, {
          pagination: {
            limit: 10,
            offset: 0
          }
        })
      ).rejects.toThrow(new CommunityNotFoundError(communityId))
    })

    it('should throw NotAuthorizedError when user is not a member', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)

      await expect(
        communityComponent.getCommunityMembers(communityId, mockUserAddress, {
          pagination: {
            limit: 10,
            offset: 0
          }
        })
      ).rejects.toThrow(new NotAuthorizedError("The user doesn't have permission to get community members"))
    })

    it('should handle pagination correctly', async () => {
      await communityComponent.getCommunityMembers(communityId, mockUserAddress, {
        pagination: {
          limit: 1,
          offset: 1
        }
      })

      expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
        userAddress: mockUserAddress,
        pagination: {
          limit: 1,
          offset: 1
        },
        onlinePeers: []
      })
    })

    it('should filter out members without profiles', async () => {
      mockCatalystClient.getProfiles.mockResolvedValue([mockProfiles[0]]) // Only return profile for first member

      const result = await communityComponent.getCommunityMembers(communityId, mockUserAddress, {
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(result.members).toHaveLength(1)
      expect(result.members[0].memberAddress).toBe(mockMembers[0].memberAddress)
    })

    describe('when filtering for online members', () => {
      const onlinePeers = ['0x1111111111111111111111111111111111111111']

      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
        mockCommunitiesDB.getCommunityMembers.mockResolvedValue(
          mockMembers.filter((member) => onlinePeers.includes(member.memberAddress))
        )
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValue(onlinePeers.length)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
        mockPeersStats.getConnectedPeers.mockResolvedValueOnce(onlinePeers)
      })

      it('should return only online members when onlyOnline is true', async () => {
        const result = await communityComponent.getCommunityMembers(communityId, mockUserAddress, {
          pagination: {
            limit: 10,
            offset: 0
          },
          onlyOnline: true
        })

        expect(result.members).toHaveLength(1)
        expect(result.members[0].memberAddress).toBe(onlinePeers[0])
        expect(result.totalMembers).toBe(1)
      })

      it('should fetch online peers from peersStats component', async () => {
        await communityComponent.getCommunityMembers(communityId, mockUserAddress, {
          pagination: {
            limit: 10,
            offset: 0
          },
          onlyOnline: true
        })

        expect(mockPeersStats.getConnectedPeers).toHaveBeenCalled()
      })

      it('should pass online peers to database queries', async () => {
        await communityComponent.getCommunityMembers(communityId, mockUserAddress, {
          pagination: {
            limit: 10,
            offset: 0
          },
          onlyOnline: true
        })

        expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
          userAddress: mockUserAddress,
          pagination: {
            limit: 10,
            offset: 0
          },
          onlinePeers
        })

        expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(communityId, { onlinePeers })
      })
    })
  })

  describe('and getting banned members', () => {
    const communityId = 'test-community'
    const mockBannedMembers = [
      {
        communityId: 'test-community',
        memberAddress: '0x1111111111111111111111111111111111111111',
        bannedAt: new Date().toISOString(),
        bannedBy: '0x1234567890123456789012345678901234567890',
        lastFriendshipAction: Action.REQUEST,
        actingUser: '0x1111111111111111111111111111111111111111'
      },
      {
        communityId: 'test-community',
        memberAddress: '0x2222222222222222222222222222222222222222',
        bannedAt: new Date().toISOString(),
        bannedBy: '0x1234567890123456789012345678901234567890',
        lastFriendshipAction: Action.ACCEPT,
        actingUser: '0x2222222222222222222222222222222222222222'
      }
    ]

    const mockProfiles: Profile[] = [
      createMockProfile('0x1111111111111111111111111111111111111111'),
      createMockProfile('0x2222222222222222222222222222222222222222')
    ]

    beforeEach(() => {
      mockCommunitiesDB.communityExists.mockResolvedValue(true)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Moderator)
      mockCommunitiesDB.getBannedMembers.mockResolvedValue(mockBannedMembers)
      mockCommunitiesDB.getBannedMembersCount.mockResolvedValue(2)
      mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
    })

    it('should return banned members with profiles and friendship status', async () => {
      const result = await communityComponent.getBannedMembers(communityId, mockUserAddress, {
        limit: 10,
        offset: 0
      })

      expect(result).toEqual({
        members: expect.arrayContaining([
          expect.objectContaining({
            ...mockBannedMembers[0],
            profilePictureUrl: expect.any(String),
            hasClaimedName: expect.any(Boolean),
            name: expect.any(String),
            friendshipStatus: expect.any(Number)
          }),
          expect.objectContaining({
            ...mockBannedMembers[1],
            profilePictureUrl: expect.any(String),
            hasClaimedName: expect.any(Boolean),
            name: expect.any(String),
            friendshipStatus: expect.any(Number)
          })
        ]),
        totalMembers: 2
      })
    })

    it('should fetch banned members and total count from the database', async () => {
      await communityComponent.getBannedMembers(communityId, mockUserAddress, {
        limit: 10,
        offset: 0
      })

      expect(mockCommunitiesDB.getBannedMembers).toHaveBeenCalledWith(communityId, mockUserAddress, {
        limit: 10,
        offset: 0
      })
      expect(mockCommunitiesDB.getBannedMembersCount).toHaveBeenCalledWith(communityId)
    })

    it('should fetch profiles from catalyst', async () => {
      await communityComponent.getBannedMembers(communityId, mockUserAddress, {
        limit: 10,
        offset: 0
      })

      expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(
        mockBannedMembers.map((member) => member.memberAddress)
      )
    })

    it('should throw CommunityNotFoundError when community does not exist', async () => {
      mockCommunitiesDB.communityExists.mockResolvedValue(false)

      await expect(
        communityComponent.getBannedMembers(communityId, mockUserAddress, {
          limit: 10,
          offset: 0
        })
      ).rejects.toThrow(new CommunityNotFoundError(communityId))
    })

    it('should throw NotAuthorizedError when user is not authorized', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)

      await expect(
        communityComponent.getBannedMembers(communityId, mockUserAddress, {
          limit: 10,
          offset: 0
        })
      ).rejects.toThrow(new NotAuthorizedError("The user doesn't have permission to get banned members"))
    })

    it('should handle pagination correctly', async () => {
      await communityComponent.getBannedMembers(communityId, mockUserAddress, {
        limit: 1,
        offset: 1
      })

      expect(mockCommunitiesDB.getBannedMembers).toHaveBeenCalledWith(communityId, mockUserAddress, {
        limit: 1,
        offset: 1
      })
    })

    it('should filter out members without profiles', async () => {
      mockCatalystClient.getProfiles.mockResolvedValue([mockProfiles[0]]) // Only return profile for first member

      const result = await communityComponent.getBannedMembers(communityId, mockUserAddress, {
        limit: 10,
        offset: 0
      })

      expect(result.members).toHaveLength(1)
      expect(result.members[0].memberAddress).toBe(mockBannedMembers[0].memberAddress)
    })
  })

  describe('and getting members from public community', () => {
    const communityId = 'test-community'
    const mockMembers = [
      {
        communityId: 'test-community',
        memberAddress: '0x1111111111111111111111111111111111111111',
        role: CommunityRole.Member,
        joinedAt: new Date().toISOString(),
        lastFriendshipAction: Action.REQUEST,
        actingUser: '0x1111111111111111111111111111111111111111'
      },
      {
        communityId: 'test-community',
        memberAddress: '0x2222222222222222222222222222222222222222',
        role: CommunityRole.Moderator,
        joinedAt: new Date().toISOString(),
        lastFriendshipAction: Action.ACCEPT,
        actingUser: '0x2222222222222222222222222222222222222222'
      }
    ]

    const mockProfiles: Profile[] = [
      createMockProfile('0x1111111111111111111111111111111111111111'),
      createMockProfile('0x2222222222222222222222222222222222222222')
    ]

    beforeEach(() => {
      mockCommunitiesDB.communityExists.mockResolvedValue(true)
      mockCommunitiesDB.getCommunityMembers.mockResolvedValue(mockMembers)
      mockCommunitiesDB.getCommunityMembersCount.mockResolvedValue(2)
      mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
    })

    it('should return members with profiles and friendship status', async () => {
      const result = await communityComponent.getMembersFromPublicCommunity(communityId, {
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(result).toEqual({
        members: expect.arrayContaining([
          expect.objectContaining({
            ...mockMembers[0],
            profilePictureUrl: expect.any(String),
            hasClaimedName: expect.any(Boolean),
            name: expect.any(String)
          }),
          expect.objectContaining({
            ...mockMembers[1],
            profilePictureUrl: expect.any(String),
            hasClaimedName: expect.any(Boolean),
            name: expect.any(String)
          })
        ]),
        totalMembers: 2
      })
    })

    it('should fetch members and total count from the database', async () => {
      await communityComponent.getMembersFromPublicCommunity(communityId, {
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
        userAddress: undefined,
        pagination: { limit: 10, offset: 0 },
        onlinePeers: []
      })
      expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(communityId, { onlinePeers: [] })
    })

    it('should fetch profiles from catalyst', async () => {
      await communityComponent.getMembersFromPublicCommunity(communityId, {
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(mockMembers.map((member) => member.memberAddress))
    })

    it('should throw CommunityNotFoundError when community does not exist', async () => {
      mockCommunitiesDB.communityExists.mockResolvedValue(false)

      await expect(
        communityComponent.getMembersFromPublicCommunity(communityId, {
          pagination: {
            limit: 10,
            offset: 0
          }
        })
      ).rejects.toThrow(new CommunityNotFoundError(communityId))
    })

    it('should handle pagination correctly', async () => {
      await communityComponent.getMembersFromPublicCommunity(communityId, {
        pagination: {
          limit: 1,
          offset: 1
        }
      })

      expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
        userAddress: undefined,
        pagination: { limit: 1, offset: 1 },
        onlinePeers: []
      })
    })

    it('should filter out members without profiles', async () => {
      mockCatalystClient.getProfiles.mockResolvedValue([mockProfiles[0]]) // Only return profile for first member

      const result = await communityComponent.getMembersFromPublicCommunity(communityId, {
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      expect(result.members).toHaveLength(1)
      expect(result.members[0].memberAddress).toBe(mockMembers[0].memberAddress)
    })
  })

  describe('updateMemberRole', () => {
    describe('when community does not exist', () => {
      it('should throw CommunityNotFoundError', async () => {
        const communityId = 'non-existent'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Moderator

        mockCommunitiesDB.communityExists.mockResolvedValue(false)

        await expect(
          communityComponent.updateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(CommunityNotFoundError)
      })
    })

    describe('when user does not have permission to update role', () => {
      it('should throw NotAuthorizedError', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Moderator

        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Member,
          [targetAddress]: CommunityRole.Member
        })

        await expect(
          communityComponent.updateMemberRole(communityId, updaterAddress, targetAddress, newRole)
        ).rejects.toThrow(NotAuthorizedError)
      })
    })

    describe('when user has permission to update role', () => {
      it('should update the member role', async () => {
        const communityId = 'community-1'
        const updaterAddress = '0x123'
        const targetAddress = '0x456'
        const newRole = CommunityRole.Moderator

        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunityMemberRoles.mockResolvedValue({
          [updaterAddress]: CommunityRole.Owner,
          [targetAddress]: CommunityRole.Member
        })

        await communityComponent.updateMemberRole(communityId, updaterAddress, targetAddress, newRole)

        expect(mockCommunitiesDB.updateMemberRole).toHaveBeenCalledWith(communityId, targetAddress, newRole)
      })
    })
  })
})

describe('Community Utils', () => {
  describe('isOwner', () => {
    const mockCommunity: Community & { role: CommunityRole } = {
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
    const mockCommunity: Community & { role: CommunityRole } = {
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

  describe('mapMembersWithProfiles', () => {
    const mockUserAddress = '0x1234567890123456789012345678901234567890'
    const mockMembers = [
      {
        memberAddress: '0x1111111111111111111111111111111111111111',
        role: CommunityRole.Member,
        lastFriendshipAction: Action.REQUEST,
        actingUser: '0x1111111111111111111111111111111111111111'
      },
      {
        memberAddress: '0x2222222222222222222222222222222222222222',
        role: CommunityRole.Moderator,
        lastFriendshipAction: Action.ACCEPT,
        actingUser: '0x2222222222222222222222222222222222222222'
      },
      {
        memberAddress: '0x3333333333333333333333333333333333333333',
        role: CommunityRole.Owner,
        lastFriendshipAction: Action.REQUEST,
        actingUser: mockUserAddress
      }
    ]

    const mockProfiles: Profile[] = [
      createMockProfile('0x1111111111111111111111111111111111111111'),
      createMockProfile('0x2222222222222222222222222222222222222222')
    ]

    it('should map members with their profiles and include friendship status', () => {
      const result = mapMembersWithProfiles(mockUserAddress, mockMembers, mockProfiles)

      expect(result).toHaveLength(2)
      result.forEach((member) => {
        expect(member).toHaveProperty('profilePictureUrl')
        expect(member).toHaveProperty('hasClaimedName')
        expect(member).toHaveProperty('name')
        expect(member).toHaveProperty('friendshipStatus')
      })
    })

    it('should filter out members without profiles', () => {
      const result = mapMembersWithProfiles(mockUserAddress, mockMembers, mockProfiles)

      expect(result).toHaveLength(2)
      expect(result.find((m) => m.memberAddress === '0x3333333333333333333333333333333333333333')).toBeUndefined()
    })

    it('should preserve all original member properties', () => {
      const result = mapMembersWithProfiles(mockUserAddress, mockMembers, mockProfiles)

      result.forEach((member, index) => {
        const originalMember = mockMembers[index]
        expect(member.role).toBe(originalMember.role)
        expect(member.memberAddress).toBe(originalMember.memberAddress)
        expect(member.lastFriendshipAction).toBe(originalMember.lastFriendshipAction)
        expect(member.actingUser).toBe(originalMember.actingUser)
      })
    })

    it('should set friendship status to NONE when no friendship action exists', () => {
      const membersWithoutFriendship = mockMembers.map(({ lastFriendshipAction, actingUser, ...rest }) => rest)
      const result = mapMembersWithProfiles(mockUserAddress, membersWithoutFriendship, mockProfiles)

      result.forEach((member) => {
        expect(member.friendshipStatus).toBe(FriendshipStatus.NONE)
      })
    })

    it('should include friendship status when friendship action exists', () => {
      const result = mapMembersWithProfiles(mockUserAddress, mockMembers, mockProfiles)

      result.forEach((member) => {
        expect(member.friendshipStatus).toBeDefined()
        // We don't test the specific status value as that's getFriendshipRequestStatus's responsibility
      })
    })

    it('should handle empty members array', () => {
      const result = mapMembersWithProfiles(mockUserAddress, [], mockProfiles)
      expect(result).toHaveLength(0)
    })

    it('should handle empty profiles array', () => {
      const result = mapMembersWithProfiles(mockUserAddress, mockMembers, [])
      expect(result).toHaveLength(0)
    })
  })
})
