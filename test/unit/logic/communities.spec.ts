import { CommunityRole } from '../../../src/types'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs, mockCatalystClient, mockConfig, mockCdnCacheInvalidator } from '../../mocks/components'
import { createS3ComponentMock } from '../../mocks/components/s3'
import { createCommunityComponent } from '../../../src/logic/community/communities'
import {
  ICommunitiesComponent,
  ICommunityRolesComponent,
  ICommunityPlacesComponent,
  ICommunityOwnersComponent,
  ICommunityEventsComponent,
  ICommunityThumbnailComponent,
  ICommunityBroadcasterComponent,
  CommunityPrivacyEnum,
  CommunityPublicInformation,
  CommunityUpdates
} from '../../../src/logic/community/types'
import {
  createMockCommunityRolesComponent,
  createMockCommunityPlacesComponent,
  createMockCommunityOwnersComponent,
  createMockCommunityEventsComponent,
  createMockCommunityBroadcasterComponent,
  createMockCommunityThumbnailComponent,
  createMockCommunityComplianceValidatorComponent
} from '../../mocks/communities'
import { createMockProfile } from '../../mocks/profile'
import { Community } from '../../../src/logic/community/types'
import { createCommsGatekeeperMockedComponent } from '../../mocks/components/comms-gatekeeper'
import { Events } from '@dcl/schemas'
import { ICommunityComplianceValidatorComponent } from '../../../src/logic/community/compliance-validator'

describe('Community Component', () => {
  let communityComponent: ICommunitiesComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
  let mockCommunityPlaces: jest.Mocked<ICommunityPlacesComponent>
  let mockCommunityOwners: jest.Mocked<ICommunityOwnersComponent>
  let mockCommunityEvents: jest.Mocked<ICommunityEventsComponent>
  let mockStorage: jest.Mocked<ReturnType<typeof createS3ComponentMock>>
  let mockCommunityBroadcaster: jest.Mocked<ICommunityBroadcasterComponent>
  let mockCommunityThumbnail: jest.Mocked<ICommunityThumbnailComponent>
  let mockCommsGatekeeper: jest.Mocked<ReturnType<typeof createCommsGatekeeperMockedComponent>>
  let mockCommunityComplianceValidator: jest.Mocked<ICommunityComplianceValidatorComponent>

  let mockUserAddress: string
  
  const communityId = 'test-community'
  const cdnUrl = 'https://cdn.decentraland.org'
  const mockCommunity: Community = {
    id: communityId,
    name: 'Test Community',
    description: 'Test Description',
    ownerAddress: '0x1234567890123456789012345678901234567890',
    privacy: CommunityPrivacyEnum.Public,
    active: true,
    thumbnails: undefined
  }

  beforeEach(async () => {
    mockUserAddress = '0x1234567890123456789012345678901234567890'
    mockCommunityRoles = createMockCommunityRolesComponent({})
    mockCommunityPlaces = createMockCommunityPlacesComponent({})
    mockCommunityOwners = createMockCommunityOwnersComponent({})
    mockCommunityEvents = createMockCommunityEventsComponent({})
    mockStorage = createS3ComponentMock() as jest.Mocked<ReturnType<typeof createS3ComponentMock>>
    mockCommunityBroadcaster = createMockCommunityBroadcasterComponent({})
    mockCommunityThumbnail = createMockCommunityThumbnailComponent({})
    mockCommsGatekeeper = createCommsGatekeeperMockedComponent({})
    mockCommunityComplianceValidator = createMockCommunityComplianceValidatorComponent({})
    mockConfig.requireString.mockResolvedValue(cdnUrl)
    mockCommunityThumbnail.buildThumbnailUrl.mockImplementation(
      (communityId: string) => `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
    )
    communityComponent = createCommunityComponent({
      communitiesDb: mockCommunitiesDB,
      catalystClient: mockCatalystClient,
      communityRoles: mockCommunityRoles,
      communityPlaces: mockCommunityPlaces,
      communityOwners: mockCommunityOwners,
      communityEvents: mockCommunityEvents,
      cdnCacheInvalidator: mockCdnCacheInvalidator,
      commsGatekeeper: mockCommsGatekeeper,
      logs: mockLogs,
      communityBroadcaster: mockCommunityBroadcaster,
      communityThumbnail: mockCommunityThumbnail,
      communityComplianceValidator: mockCommunityComplianceValidator
    })
  })

  describe('when getting a community', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'

    describe('and the community exists', () => {
      const mockVoiceChatStatus = {
        isActive: true,
        participantCount: 5,
        moderatorCount: 2
      }

      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValue(10)
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue(mockVoiceChatStatus)
        mockCommunityOwners.getOwnerName.mockResolvedValue('Test Owner Name')
        mockCommunityEvents.isCurrentlyHostingEvents.mockResolvedValue(false)
      })

      it('should return community with members count and owner name and voice chat status', async () => {
        const result = await communityComponent.getCommunity(communityId, { as: userAddress })

        expect(result).toEqual({
          id: mockCommunity.id,
          name: mockCommunity.name,
          description: mockCommunity.description,
          ownerAddress: mockCommunity.ownerAddress,
          privacy: mockCommunity.privacy,
          active: mockCommunity.active,
          thumbnails: undefined,
          role: CommunityRole.Member,
          membersCount: 10,
          voiceChatStatus: mockVoiceChatStatus,
          ownerName: 'Test Owner Name',
          isHostingLiveEvent: false
        })

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(communityId)
        expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
        expect(mockCommunityOwners.getOwnerName).toHaveBeenCalledWith(mockCommunity.ownerAddress, communityId)
        expect(mockCommunityEvents.isCurrentlyHostingEvents).toHaveBeenCalledWith(communityId)
      })

      describe('when the community has a thumbnail', () => {
        beforeEach(() => {
          mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(
            `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
          )
        })

        it('should include thumbnail when it exists', async () => {
          const result = await communityComponent.getCommunity(communityId, {
            as: userAddress
          })

          expect(result.thumbnails).toEqual({
            raw: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
          })
        })
      })

      describe('when the community has no active voice chat', () => {
        beforeEach(() => {
          mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue(null)
        })

        it('should return null for voice chat status', async () => {
          const result = await communityComponent.getCommunity(communityId, {
            as: userAddress
          })

          expect(result.voiceChatStatus).toBeNull()
        })
      })

      describe('when the community is hosting live events', () => {
        beforeEach(() => {
          mockCommunityEvents.isCurrentlyHostingEvents.mockResolvedValue(true)
        })

        it('should include isHostingLiveEvent when community is hosting live events', async () => {
          const result = await communityComponent.getCommunity(communityId, {
            as: userAddress
          })

          expect(result.isHostingLiveEvent).toBe(true)
          expect(mockCommunityEvents.isCurrentlyHostingEvents).toHaveBeenCalledWith(communityId)
        })
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValue(0)
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityComponent.getCommunity(communityId, { as: userAddress })).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(communityId)
        expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
      })
    })
  })

  describe('when getting communities', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    const options = { pagination: { limit: 10, offset: 0 }, search: 'test' }
    const mockCommunities = [
      {
        ...mockCommunity,
        role: CommunityRole.Member,
        membersCount: 10,
        friends: ['0xfriend1', '0xfriend2'],
        isHostingLiveEvent: false,
        voiceChatStatus: {
          isActive: true,
          participantCount: 3,
          moderatorCount: 1
        }
      }
    ]
    const mockProfiles = [createMockProfile('0xfriend1'), createMockProfile('0xfriend2')]

    beforeEach(() => {
      mockCommunitiesDB.getCommunities.mockResolvedValue(mockCommunities)
      mockCommunitiesDB.getCommunitiesCount.mockResolvedValue(1)
      mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      mockCommunityOwners.getOwnerName.mockResolvedValue('Test Owner Name')
      mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValue({
        [mockCommunity.id]: {
          isActive: true,
          participantCount: 3,
          moderatorCount: 1
        }
      })
    })

    it('should return communities with total count and owner names', async () => {
      const result = await communityComponent.getCommunities(userAddress, options)

      expect(result).toEqual({
        communities: expect.arrayContaining([
          expect.objectContaining({
            id: mockCommunity.id,
            name: mockCommunity.name,
            description: mockCommunity.description,
            ownerAddress: mockCommunity.ownerAddress,
            ownerName: 'Test Owner Name',
            privacy: mockCommunity.privacy,
            active: mockCommunity.active,
            friends: expect.arrayContaining([
              expect.objectContaining({
                address: '0xfriend1',
                name: 'Profile name 0xfriend1',
                hasClaimedName: true
              }),
              expect.objectContaining({
                address: '0xfriend2',
                name: 'Profile name 0xfriend2',
                hasClaimedName: true
              })
            ])
          })
        ]),
        total: 1
      })

      expect(mockCommunitiesDB.getCommunities).toHaveBeenCalledWith(userAddress, options)
      expect(mockCommunitiesDB.getCommunitiesCount).toHaveBeenCalledWith(userAddress, options)
      expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1', '0xfriend2'])
      expect(mockCommunityOwners.getOwnerName).toHaveBeenCalledWith(mockCommunity.ownerAddress, communityId)
    })

    it('should handle empty communities array gracefully', async () => {
      mockCommunitiesDB.getCommunities.mockResolvedValueOnce([])
      mockCommunitiesDB.getCommunitiesCount.mockResolvedValueOnce(0)

      const result = await communityComponent.getCommunities(userAddress, options)

      expect(result).toEqual({
        communities: [],
        total: 0
      })

      expect(mockCommunitiesDB.getCommunities).toHaveBeenCalledWith(userAddress, options)
      expect(mockCommunitiesDB.getCommunitiesCount).toHaveBeenCalledWith(userAddress, options)
      expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
    })

    it('should handle error in getVoiceChatStatuses helper function gracefully', async () => {
      mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockRejectedValueOnce(
        new Error('Network error in voice chat service')
      )

      const result = await communityComponent.getCommunities(userAddress, options)

      expect(result.communities).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    describe('and the communities have a thumbnail', () => {
      beforeEach(() => {
        mockCommunities.forEach(() => {
          mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(
            `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
          )
        })
      })

      it('should include thumbnails', async () => {
        const result = await communityComponent.getCommunities(userAddress, options)

        expect(result.communities[0].thumbnails).toEqual({
          raw: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
        })
      })
    })

    describe('when filtering by active voice chat', () => {
      const optionsWithVoiceChat = { ...options, onlyWithActiveVoiceChat: true }
      const mockCommunitiesWithVoiceChat = [
        {
          ...mockCommunities[0],
          id: 'community-with-voice-chat'
        },
        {
          ...mockCommunities[0],
          id: 'community-without-voice-chat'
        }
      ]

      beforeEach(() => {
        mockCommunitiesDB.getCommunities.mockResolvedValue(mockCommunitiesWithVoiceChat)
        mockCommunitiesDB.getCommunitiesCount.mockResolvedValue(2)
        mockStorage.exists.mockResolvedValue(false)
        mockCatalystClient.getProfiles.mockResolvedValue([])
        mockCommunityOwners.getOwnerName.mockResolvedValue('Test Owner Name')

        mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValue({
          'community-with-voice-chat': { isActive: true, participantCount: 3, moderatorCount: 1 },
          'community-without-voice-chat': { isActive: false, participantCount: 0, moderatorCount: 0 }
        })
      })

      it('should return only communities with active voice chat when onlyWithActiveVoiceChat is true', async () => {
        const result = await communityComponent.getCommunities(userAddress, optionsWithVoiceChat)

        expect(result.communities).toHaveLength(1)
        expect(result.communities[0].id).toBe('community-with-voice-chat')
        expect(result.total).toBe(1)

        expect(mockCommsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalledWith([
          'community-with-voice-chat',
          'community-without-voice-chat'
        ])
      })

      it('should handle empty communities array when filtering by voice chat', async () => {
        mockCommunitiesDB.getCommunities.mockResolvedValueOnce([])
        mockCommunitiesDB.getCommunitiesCount.mockResolvedValueOnce(0)

        const result = await communityComponent.getCommunities(userAddress, optionsWithVoiceChat)

        expect(result.communities).toHaveLength(0)
        expect(result.total).toBe(0)

        expect(mockCommsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalledWith([])
      })

      describe('when voice chat status check fails', () => {
        beforeEach(() => {
          mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockRejectedValueOnce(
            new Error('Voice chat service unavailable')
          )
        })

        it('should return no communities when status check fails and onlyWithActiveVoiceChat is true', async () => {
          const result = await communityComponent.getCommunities(userAddress, optionsWithVoiceChat)

          expect(result.communities).toHaveLength(0)
          expect(result.total).toBe(0)
        })
      })

      describe('when voice chat status check returns null/undefined', () => {
        beforeEach(() => {
          mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValueOnce(null)
        })

        it('should handle null response gracefully and return communities', async () => {
          const result = await communityComponent.getCommunities(userAddress, optionsWithVoiceChat)

          expect(result.communities).toHaveLength(0)
          expect(result.total).toBe(0)
        })
      })
    })
  })

  describe('when getting public communities', () => {
    const options = { pagination: { limit: 10, offset: 0 }, search: 'test' }
    let mockCommunities: Omit<CommunityPublicInformation, 'ownerName'>[] = []

    beforeEach(() => {
      mockCommunities = [
        {
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0x1234567890123456789012345678901234567890',
          privacy: CommunityPrivacyEnum.Public,
          active: true,
          membersCount: 10,
          isHostingLiveEvent: false
        }
      ]
      mockCommunitiesDB.getCommunitiesPublicInformation.mockResolvedValue(mockCommunities)
      mockCommunitiesDB.getPublicCommunitiesCount.mockResolvedValue(1)
      mockCommunityOwners.getOwnerName.mockResolvedValue('Test Owner Name')
      mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValue({
        [communityId]: {
          isActive: false,
          participantCount: 0,
          moderatorCount: 0
        }
      })
    })

    it('should return public communities with total count and owner names', async () => {
      const result = await communityComponent.getCommunitiesPublicInformation(options)

      expect(result).toEqual({
        communities: expect.arrayContaining([
          expect.objectContaining({
            id: mockCommunity.id,
            name: mockCommunity.name,
            description: mockCommunity.description,
            ownerAddress: mockCommunity.ownerAddress,
            privacy: CommunityPrivacyEnum.Public,
            active: mockCommunity.active,
            membersCount: 10,
            isHostingLiveEvent: false,
            ownerName: 'Test Owner Name'
          })
        ]),
        total: 1
      })

      expect(mockCommunitiesDB.getCommunitiesPublicInformation).toHaveBeenCalledWith(options)
      expect(mockCommunitiesDB.getPublicCommunitiesCount).toHaveBeenCalledWith({ search: 'test' })
      expect(mockCommunityOwners.getOwnerName).toHaveBeenCalledWith(mockCommunity.ownerAddress, communityId)
    })

    it('should handle error in getVoiceChatStatuses helper function gracefully', async () => {
      mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockRejectedValueOnce(
        new Error('Network error in voice chat service')
      )

      const result = await communityComponent.getCommunitiesPublicInformation(options)

      expect(result.communities).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    describe('and the communities have a thumbnail', () => {
      beforeEach(() => {
        mockCommunities.forEach(() => {
          mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(
            `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
          )
        })
      })

      it('should include thumbnails when they exist', async () => {
        const result = await communityComponent.getCommunitiesPublicInformation(options)

        expect(result.communities[0].thumbnails).toEqual({
          raw: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
        })
      })
    })

    describe('when filtering by active voice chat', () => {
      const optionsWithVoiceChat = { ...options, onlyWithActiveVoiceChat: true }
      const mockCommunitiesWithVoiceChat: Omit<CommunityPublicInformation, 'ownerName'>[] = [
        {
          ...mockCommunities[0],
          id: 'public-community-with-voice-chat'
        },
        {
          ...mockCommunities[0],
          id: 'public-community-without-voice-chat'
        }
      ]

      beforeEach(() => {
        mockCommunitiesDB.getCommunitiesPublicInformation.mockResolvedValue(mockCommunitiesWithVoiceChat)
        mockCommunitiesDB.getPublicCommunitiesCount.mockResolvedValue(2)
        mockStorage.exists.mockResolvedValue(false)
        mockCommunityOwners.getOwnerName.mockResolvedValue('Test Owner Name')

        mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValue({
          'public-community-with-voice-chat': { isActive: true, participantCount: 5, moderatorCount: 2 },
          'public-community-without-voice-chat': { isActive: false, participantCount: 0, moderatorCount: 0 }
        })
      })

      it('should return only public communities with active voice chat when onlyWithActiveVoiceChat is true', async () => {
        const result = await communityComponent.getCommunitiesPublicInformation(optionsWithVoiceChat)

        expect(result.communities).toHaveLength(1)
        expect(result.communities[0].id).toBe('public-community-with-voice-chat')
        expect(result.total).toBe(1)

        expect(mockCommsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalledWith([
          'public-community-with-voice-chat',
          'public-community-without-voice-chat'
        ])
      })

      it('should handle empty communities array when filtering by voice chat', async () => {
        mockCommunitiesDB.getCommunitiesPublicInformation.mockResolvedValueOnce([])
        mockCommunitiesDB.getPublicCommunitiesCount.mockResolvedValueOnce(0)

        const result = await communityComponent.getCommunitiesPublicInformation(optionsWithVoiceChat)

        expect(result.communities).toHaveLength(0)
        expect(result.total).toBe(0)

        expect(mockCommsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalledWith([])
      })

      describe('when voice chat status check fails', () => {
        beforeEach(() => {
          mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockRejectedValueOnce(
            new Error('Voice chat service unavailable')
          )
        })

        it('should return communities with null voice chat status when status check fails', async () => {
          const result = await communityComponent.getCommunitiesPublicInformation(optionsWithVoiceChat)

          expect(result.communities).toHaveLength(0)
          expect(result.total).toBe(0)
        })
      })

      describe('when voice chat status check returns null/undefined', () => {
        beforeEach(() => {
          mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValueOnce(null)
        })

        it('should handle null response gracefully and return communities', async () => {
          const result = await communityComponent.getCommunitiesPublicInformation(optionsWithVoiceChat)

          expect(result.communities).toHaveLength(0)
          expect(result.total).toBe(0)
        })
      })
    })
  })

  describe('when getting member communities', () => {
    const memberAddress = '0x1234567890123456789012345678901234567890'
    const options = { pagination: { limit: 10, offset: 0 } }
    const mockMemberCommunities = [
      {
        id: communityId,
        name: 'Test Community',
        description: 'Test Description',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        privacy: CommunityPrivacyEnum.Public,
        active: true,
        role: CommunityRole.Member,
        joinedAt: '2023-01-01T00:00:00Z'
      }
    ]

    beforeEach(() => {
      mockCommunitiesDB.getMemberCommunities.mockResolvedValue(mockMemberCommunities)
      mockCommunitiesDB.getCommunitiesCount.mockResolvedValue(1)
    })

    it('should return member communities with total count', async () => {
      const result = await communityComponent.getMemberCommunities(memberAddress, options)

      expect(result).toEqual({
        communities: mockMemberCommunities,
        total: 1
      })

      expect(mockCommunitiesDB.getMemberCommunities).toHaveBeenCalledWith(memberAddress, options)
      expect(mockCommunitiesDB.getCommunitiesCount).toHaveBeenCalledWith(memberAddress, { onlyMemberOf: true })
    })
  })

  describe('when creating a community', () => {
    const ownerAddress = '0x1234567890123456789012345678901234567890'
    const communityData = {
      name: 'New Community',
      description: 'New Description',
      ownerAddress,
      privacy: CommunityPrivacyEnum.Public
    }
    const placeIds = ['place-1', 'place-2']
    const thumbnail = Buffer.from('fake-thumbnail')
    let ownedNames: any[]
    let createdCommunity: any

    beforeEach(() => {
      ownedNames = []
      createdCommunity = {
        ...mockCommunity,
        ...communityData,
        id: 'new-community-id'
      }
      mockCatalystClient.getOwnedNames.mockResolvedValue(ownedNames)
      mockCommunitiesDB.createCommunity.mockResolvedValue(createdCommunity)
      mockCommunitiesDB.addCommunityMember.mockResolvedValue()
      mockCommunityPlaces.addPlaces.mockResolvedValue()
      mockCommunityThumbnail.uploadThumbnail.mockResolvedValue(
        `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
      )
      mockCommunityOwners.getOwnerName.mockResolvedValue('Test Owner Name')
    })

    describe('and the user has owned names', () => {
      beforeEach(() => {
        ownedNames = [{ id: '1', name: 'test-name', contractAddress: '0xcontract', tokenId: '1' }]
        mockCatalystClient.getOwnedNames.mockResolvedValue(ownedNames)
      })

      describe('and no places are provided', () => {
        beforeEach(() => {
          mockCommunityPlaces.validateOwnership.mockResolvedValue({
            isValid: true,
            ownedPlaces: [],
            notOwnedPlaces: []
          })
        })

        it('should create community successfully without places and thumbnail', async () => {
          const result = await communityComponent.createCommunity(communityData)

          expect(result).toEqual({
            ...mockCommunity,
            ...communityData,
            id: 'new-community-id',
            ownerName: 'Test Owner Name',
            isHostingLiveEvent: false
          })

          expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
          expect(mockCommunityOwners.getOwnerName).toHaveBeenCalledWith(ownerAddress)
          expect(mockCommunityPlaces.validateOwnership).not.toHaveBeenCalled()
          expect(mockCommunityComplianceValidator.validateCommunityCreation).toHaveBeenCalledWith(
            communityData.name,
            communityData.description,
            undefined
          )
          expect(mockCommunitiesDB.createCommunity).toHaveBeenCalledWith({
            ...communityData,
            owner_address: ownerAddress,
            private: false,
            active: true
          })
          expect(mockCommunitiesDB.addCommunityMember).toHaveBeenCalledWith({
            communityId: 'new-community-id',
            memberAddress: ownerAddress,
            role: CommunityRole.Owner
          })
          expect(mockCommunityPlaces.addPlaces).not.toHaveBeenCalled()
          expect(mockCommunityThumbnail.uploadThumbnail).not.toHaveBeenCalled()
        })

        it('should create community successfully with thumbnail', async () => {
          const newCommunityId = 'new-community-id'
          const result = await communityComponent.createCommunity(communityData, thumbnail)

          expect(result).toEqual({
            ...mockCommunity,
            ...communityData,
            id: newCommunityId,
            ownerName: 'Test Owner Name',
            isHostingLiveEvent: false,
            thumbnails: {
              raw: `https://cdn.decentraland.org/social/communities/${newCommunityId}/raw-thumbnail.png`
            }
          })

          expect(mockCommunityComplianceValidator.validateCommunityCreation).toHaveBeenCalledWith(
            communityData.name,
            communityData.description,
            thumbnail
          )
          expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith(newCommunityId, thumbnail)
        })
      })

      describe('and places are provided', () => {
        beforeEach(() => {
          mockCommunityPlaces.validateOwnership.mockResolvedValue({
            isValid: true,
            ownedPlaces: placeIds,
            notOwnedPlaces: []
          })
        })

        it('should create community successfully with places and thumbnail', async () => {
          const newCommunityId = 'new-community-id'
          const result = await communityComponent.createCommunity(communityData, thumbnail, placeIds)

          expect(result).toEqual({
            ...mockCommunity,
            ...communityData,
            id: newCommunityId,
            ownerName: 'Test Owner Name',
            isHostingLiveEvent: false,
            thumbnails: {
              raw: `https://cdn.decentraland.org/social/communities/${newCommunityId}/raw-thumbnail.png`
            }
          })

          expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(placeIds, ownerAddress)
          expect(mockCommunityComplianceValidator.validateCommunityCreation).toHaveBeenCalledWith(
            communityData.name,
            communityData.description,
            thumbnail
          )
          expect(mockCommunityPlaces.addPlaces).toHaveBeenCalledWith(newCommunityId, ownerAddress, placeIds)
          expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith(newCommunityId, thumbnail)
        })

        describe('and the user does not own all places', () => {
          beforeEach(() => {
            mockCommunityPlaces.validateOwnership.mockRejectedValue(
              new NotAuthorizedError(`The user ${ownerAddress} doesn't own all the places`)
            )
          })

          it('should throw NotAuthorizedError before calling compliance validation', async () => {
            await expect(communityComponent.createCommunity(communityData, undefined, placeIds)).rejects.toThrow(
              new NotAuthorizedError(`The user ${ownerAddress} doesn't own all the places`)
            )

            expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
            expect(mockCommunityOwners.getOwnerName).toHaveBeenCalledWith(ownerAddress)
            expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(placeIds, ownerAddress)
            expect(mockCommunityComplianceValidator.validateCommunityCreation).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.createCommunity).not.toHaveBeenCalled()
          })
        })
      })
    })

    describe('and the user has no owned names', () => {
      beforeEach(() => {
        ownedNames = []
        mockCatalystClient.getOwnedNames.mockResolvedValue(ownedNames)
      })

      it('should throw NotAuthorizedError before calling compliance validation', async () => {
        await expect(communityComponent.createCommunity(communityData)).rejects.toThrow(
          new NotAuthorizedError(`The user ${ownerAddress} doesn't have any names`)
        )

        expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
        expect(mockCommunityComplianceValidator.validateCommunityCreation).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.createCommunity).not.toHaveBeenCalled()
      })
    })
  })

  describe('when deleting a community', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    let community: any

    beforeEach(() => {
      community = null
      mockCommunitiesDB.getCommunity.mockResolvedValue(community)
      mockCommunitiesDB.deleteCommunity.mockResolvedValue()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        community = { ...mockCommunity }
        mockCommunitiesDB.getCommunity.mockResolvedValue(community)
      })

      describe('and the user is the owner', () => {
        beforeEach(() => {
          community.role = CommunityRole.Owner
          community.ownerAddress = userAddress
          mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(
            `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
          )
        })

        it('should delete the community', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDB.deleteCommunity).toHaveBeenCalledWith(communityId)
        })

        it('should publish a community deleted event', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          await new Promise((resolve) => setImmediate(resolve))
          expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
            type: Events.Type.COMMUNITY,
            subType: Events.SubType.Community.DELETED,
            key: communityId,
            timestamp: expect.any(Number),
            metadata: {
              id: communityId,
              name: community.name,
              thumbnailUrl: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
            }
          })
        })
      })

      describe('and the user is not the owner', () => {
        beforeEach(() => {
          community.role = CommunityRole.Member
          community.ownerAddress = '0xother-owner'
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow(
            new NotAuthorizedError("The user doesn't have permission to delete this community")
          )

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDB.deleteCommunity).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        community = null
        mockCommunitiesDB.getCommunity.mockResolvedValue(community)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.deleteCommunity).not.toHaveBeenCalled()
      })
    })
  })

  describe('when updating a community', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    const updates = {
      name: 'Updated Community',
      description: 'Updated Description',
      placeIds: ['place-1', 'place-2'],
      thumbnailBuffer: Buffer.from('fake-thumbnail')
    }
    let community: any
    let updatedCommunity: any

    beforeEach(() => {
      community = null
      updatedCommunity = { ...mockCommunity, ...updates }
      mockCommunitiesDB.getCommunity.mockResolvedValue(community)
      mockCommunitiesDB.updateCommunity.mockResolvedValue(updatedCommunity)
      mockCommunityRoles.validatePermissionToEditCommunity.mockResolvedValue()
      mockCommunityPlaces.validateOwnership.mockResolvedValue({
        isValid: true,
        ownedPlaces: updates.placeIds,
        notOwnedPlaces: []
      })
      mockCommunityThumbnail.uploadThumbnail.mockResolvedValue(
        `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
      )
      mockCommunityPlaces.updatePlaces.mockResolvedValue()
      mockCommunitiesDB.getCommunityPlaces.mockResolvedValue([])
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        community = { ...mockCommunity }
        mockCommunitiesDB.getCommunity.mockResolvedValue(community)
      })

      describe('and updates are provided', () => {
        describe('and the user has permission to edit', () => {
          beforeEach(() => {
            mockCommunityRoles.validatePermissionToEditCommunity.mockResolvedValue()
          })

          it('should update the community with all fields and call compliance validation', async () => {
            const result = await communityComponent.updateCommunity(communityId, userAddress, updates)

            expect(result).toEqual({
              ...mockCommunity,
              ...updates,
              thumbnails: {
                raw: `https://cdn.decentraland.org/social/communities/${communityId}/raw-thumbnail.png`
              }
            })

            expect(mockCommunityComplianceValidator.validateCommunityUpdate).toHaveBeenCalledWith(
              updates.name,
              updates.description,
              updates.thumbnailBuffer
            )
            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
              communityId,
              userAddress
            )
            expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(updates.placeIds, userAddress)
            expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updates)
            expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith(
              communityId,
              updates.thumbnailBuffer
            )
            expect(mockCdnCacheInvalidator.invalidateThumbnail).toHaveBeenCalledWith(communityId)
            expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(
              communityId,
              userAddress,
              updates.placeIds
            )
          })

          it('should update the community with only content fields and call compliance validation', async () => {
            const updatesWithOnlyContent = {
              name: 'Updated Name Only',
              description: 'Updated Description Only'
            }

            // Mock the update to return only the content fields
            mockCommunitiesDB.updateCommunity.mockResolvedValueOnce({
              ...mockCommunity,
              ...updatesWithOnlyContent
            })

            const result = await communityComponent.updateCommunity(communityId, userAddress, updatesWithOnlyContent)

            expect(result).toEqual({
              ...mockCommunity,
              ...updatesWithOnlyContent
            })

            expect(mockCommunityComplianceValidator.validateCommunityUpdate).toHaveBeenCalledWith(
              updatesWithOnlyContent.name,
              updatesWithOnlyContent.description,
              undefined
            )
          })

          it('should update the community with only non-content fields and not call compliance validation', async () => {
            const updatesWithOnlyPlaces = {
              placeIds: ['place-1', 'place-2']
            }

            // Mock the update to return only the places
            mockCommunitiesDB.updateCommunity.mockResolvedValueOnce({
              ...mockCommunity,
              ...updatesWithOnlyPlaces
            })

            // Mock place ownership validation
            mockCommunityPlaces.validateOwnership.mockResolvedValueOnce({
              isValid: true,
              ownedPlaces: updatesWithOnlyPlaces.placeIds,
              notOwnedPlaces: []
            })

            const result = await communityComponent.updateCommunity(communityId, userAddress, updatesWithOnlyPlaces)

            expect(result).toEqual({
              ...mockCommunity,
              ...updatesWithOnlyPlaces
            })

            expect(mockCommunityComplianceValidator.validateCommunityUpdate).not.toHaveBeenCalled()
            expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(
              updatesWithOnlyPlaces.placeIds,
              userAddress
            )
          })

          it('should update the community with only privacy and not call compliance validation', async () => {
            const updatesWithOnlyPrivacy = {
              privacy: CommunityPrivacyEnum.Private
            }

            // Mock the update to return only the privacy change
            mockCommunitiesDB.updateCommunity.mockResolvedValueOnce({
              ...mockCommunity,
              ...updatesWithOnlyPrivacy
            })

            const result = await communityComponent.updateCommunity(communityId, userAddress, updatesWithOnlyPrivacy)

            expect(result).toEqual({
              ...mockCommunity,
              ...updatesWithOnlyPrivacy
            })

            expect(mockCommunityComplianceValidator.validateCommunityUpdate).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, {
              ...updatesWithOnlyPrivacy,
              private: true
            })
          })

          it('should log community update success with detailed information', async () => {
            const simpleUpdate = {
              description: 'Updated description only'
            }

            mockCommunitiesDB.updateCommunity.mockResolvedValueOnce({
              ...mockCommunity,
              ...simpleUpdate
            })

            const result = await communityComponent.updateCommunity(communityId, userAddress, simpleUpdate)

            expect(result).toEqual({
              ...mockCommunity,
              ...simpleUpdate
            })

            expect(mockCommunityComplianceValidator.validateCommunityUpdate).toHaveBeenCalledWith(
              undefined,
              simpleUpdate.description,
              undefined
            )
          })

          it('should execute complete update process and log success', async () => {
            const completeUpdate = {
              name: 'Complete Update',
              description: 'Complete Description Update',
              placeIds: ['place-1'],
              thumbnailBuffer: Buffer.from('complete-thumbnail')
            }

            mockCommunitiesDB.updateCommunity.mockResolvedValueOnce({
              ...mockCommunity,
              ...completeUpdate
            })

            const result = await communityComponent.updateCommunity(communityId, userAddress, completeUpdate)

            expect(result).toEqual({
              ...mockCommunity,
              ...completeUpdate,
              thumbnails: {
                raw: `https://cdn.decentraland.org/social/communities/${communityId}/raw-thumbnail.png`
              }
            })

            expect(mockCommunityComplianceValidator.validateCommunityUpdate).toHaveBeenCalledWith(
              completeUpdate.name,
              completeUpdate.description,
              completeUpdate.thumbnailBuffer
            )
            expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, {
              ...completeUpdate,
              private: undefined
            })
            expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith(
              communityId,
              completeUpdate.thumbnailBuffer
            )
            expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(
              communityId,
              userAddress,
              completeUpdate.placeIds
            )
          })

          it('should broadcast rename event when name is updated', async () => {
            const nameUpdate = {
              name: 'New Community Name'
            }

            mockCommunitiesDB.updateCommunity.mockResolvedValueOnce({
              ...mockCommunity,
              ...nameUpdate
            })

            const result = await communityComponent.updateCommunity(communityId, userAddress, nameUpdate)

            expect(result).toEqual({
              ...mockCommunity,
              ...nameUpdate
            })

            await new Promise(resolve => setImmediate(resolve))

            expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
              type: Events.Type.COMMUNITY,
              subType: Events.SubType.Community.RENAMED,
              key: `${communityId}-new-community-name-test-community`,
              timestamp: expect.any(Number),
              metadata: {
                id: communityId,
                oldName: mockCommunity.name,
                newName: nameUpdate.name,
                thumbnailUrl: expect.any(String)
              }
            })
          })

          it('should log success for simple description update', async () => {
            const simpleDescriptionUpdate = {
              description: 'Just a description update'
            }

            mockCommunitiesDB.updateCommunity.mockResolvedValueOnce({
              ...mockCommunity,
              ...simpleDescriptionUpdate
            })

            const result = await communityComponent.updateCommunity(communityId, userAddress, simpleDescriptionUpdate)

            expect(result).toEqual({
              ...mockCommunity,
              ...simpleDescriptionUpdate
            })

            expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, simpleDescriptionUpdate)
          })

          describe('and the user does not own all places', () => {
            beforeEach(() => {
              mockCommunityPlaces.validateOwnership.mockRejectedValue(
                new NotAuthorizedError(`The user ${userAddress} doesn't own all the places`)
              )
            })

            it('should throw NotAuthorizedError before calling compliance validation', async () => {
              await expect(communityComponent.updateCommunity(communityId, userAddress, updates)).rejects.toThrow(
                new NotAuthorizedError(`The user ${userAddress} doesn't own all the places`)
              )

              expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
              expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(communityId, userAddress)
              expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(updates.placeIds, userAddress)
              expect(mockCommunityComplianceValidator.validateCommunityUpdate).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
            })
          })
        })

        describe('and the user does not have permission to edit', () => {
          beforeEach(() => {
            const permissionError = new NotAuthorizedError(
              `The user ${userAddress} doesn't have permission to edit the community`
            )
            mockCommunityRoles.validatePermissionToEditCommunity.mockRejectedValue(permissionError)
          })

          it('should throw NotAuthorizedError before calling compliance validation', async () => {
            await expect(communityComponent.updateCommunity(communityId, userAddress, updates)).rejects.toThrow(
              new NotAuthorizedError(`The user ${userAddress} doesn't have permission to edit the community`)
            )

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunityComplianceValidator.validateCommunityUpdate).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
          })
        })
      })
    })

    describe('and no updates are provided', () => {
      const emptyUpdates = {}

      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          role: CommunityRole.Owner
        })
      })

      it('should return the existing community without calling compliance validation', async () => {
        const result = await communityComponent.updateCommunity(communityId, userAddress, emptyUpdates)

        expect(result).toEqual({
          id: mockCommunity.id,
          name: mockCommunity.name,
          description: mockCommunity.description,
          ownerAddress: mockCommunity.ownerAddress,
          privacy: mockCommunity.privacy,
          active: mockCommunity.active
        })

        expect(mockCommunityComplianceValidator.validateCommunityUpdate).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunityRoles.validatePermissionToEditCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
      })
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        community = null
        mockCommunitiesDB.getCommunity.mockResolvedValue(community)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityComponent.updateCommunity(communityId, userAddress, updates)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunityRoles.validatePermissionToEditCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
      })
    })
  })
})
