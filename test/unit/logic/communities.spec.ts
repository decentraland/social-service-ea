import { CommunityRole } from '../../../src/types'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import {
  mockCatalystClient,
  mockConfig,
  mockCdnCacheInvalidator,
  createMockedPubSubComponent,
  createLogsMockedComponent
} from '../../mocks/components'
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
  CommunityUpdates,
  CommunityMember
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
import { createFeatureFlagsMockComponent } from '../../mocks/components/feature-flags'
import { FeatureFlag } from '../../../src/adapters/feature-flags'
import { COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL } from '../../../src/adapters/pubsub'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { IPubSubComponent } from '../../../src/types'
import { ILoggerComponent } from '@well-known-components/interfaces'

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
  let mockFeatureFlags: jest.Mocked<ReturnType<typeof createFeatureFlagsMockComponent>>
  let mockPubSub: jest.Mocked<IPubSubComponent>
  let mockLogs: jest.Mocked<ILoggerComponent>
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
    mockFeatureFlags = createFeatureFlagsMockComponent({})
    mockPubSub = createMockedPubSubComponent({})
    mockConfig.requireString.mockResolvedValue(cdnUrl)
    mockCommunityThumbnail.buildThumbnailUrl.mockImplementation(
      (communityId: string) => `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
    )
    mockLogs = createLogsMockedComponent({})

    mockConfig.requireString.mockResolvedValue(cdnUrl)

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
      communityComplianceValidator: mockCommunityComplianceValidator,
      featureFlags: mockFeatureFlags,
      pubsub: mockPubSub
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
      mockCommunityOwners.getOwnersNames.mockResolvedValue({
        [mockCommunity.ownerAddress]: 'Test Owner Name'
      })
      mockCommunityThumbnail.getThumbnails.mockResolvedValue({})
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
      expect(mockCommunityOwners.getOwnersNames).toHaveBeenCalledWith([mockCommunity.ownerAddress])
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
      expect(mockCommunityOwners.getOwnersNames).toHaveBeenCalledWith([])
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
        mockCommunityThumbnail.getThumbnails.mockResolvedValue({
          [communityId]: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
        })
      })

      it('should include thumbnails using batch method', async () => {
        const result = await communityComponent.getCommunities(userAddress, options)

        expect(mockCommunityThumbnail.getThumbnails).toHaveBeenCalledWith([communityId])
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
        mockCommunityOwners.getOwnersNames.mockResolvedValue({
          [mockCommunitiesWithVoiceChat[0].ownerAddress]: 'Test Owner Name',
          [mockCommunitiesWithVoiceChat[1].ownerAddress]: 'Test Owner Name'
        })
        mockCommunityThumbnail.getThumbnails.mockResolvedValue({})

        mockCommsGatekeeper.getAllActiveCommunityVoiceChats.mockResolvedValue([
          { communityId: 'community-with-voice-chat', participantCount: 3, moderatorCount: 1 }
        ])
        mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValue({
          'community-with-voice-chat': { isActive: true, participantCount: 3, moderatorCount: 1 }
        })
      })

      it('should return only communities with active voice chat when onlyWithActiveVoiceChat is true', async () => {
        const result = await communityComponent.getCommunities(userAddress, optionsWithVoiceChat)

        expect(result.communities).toHaveLength(1)
        expect(result.communities[0].id).toBe('community-with-voice-chat')
        expect(result.total).toBe(1)

        expect(mockCommsGatekeeper.getAllActiveCommunityVoiceChats).toHaveBeenCalled()
        expect(mockCommsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalledWith(['community-with-voice-chat'])
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
          mockCommsGatekeeper.getAllActiveCommunityVoiceChats.mockRejectedValueOnce(
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
          mockCommsGatekeeper.getAllActiveCommunityVoiceChats.mockResolvedValueOnce(null)
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
      mockCommunityOwners.getOwnersNames.mockResolvedValue({
        [mockCommunity.ownerAddress]: 'Test Owner Name'
      })
      mockCommunityThumbnail.getThumbnails.mockResolvedValue({})
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
      expect(mockCommunityOwners.getOwnersNames).toHaveBeenCalledWith([mockCommunity.ownerAddress])
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
        mockCommunityThumbnail.getThumbnails.mockResolvedValue({
          [communityId]: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
        })
      })

      it('should include thumbnails when they exist using batch method', async () => {
        const result = await communityComponent.getCommunitiesPublicInformation(options)

        expect(mockCommunityThumbnail.getThumbnails).toHaveBeenCalledWith([communityId])
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
        mockCommunityOwners.getOwnersNames.mockResolvedValue({
          [mockCommunitiesWithVoiceChat[0].ownerAddress]: 'Test Owner Name',
          [mockCommunitiesWithVoiceChat[1].ownerAddress]: 'Test Owner Name'
        })
        mockCommunityThumbnail.getThumbnails.mockResolvedValue({})

        mockCommsGatekeeper.getAllActiveCommunityVoiceChats.mockResolvedValue([
          { communityId: 'public-community-with-voice-chat', participantCount: 5, moderatorCount: 2 }
        ])
        mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValue({
          'public-community-with-voice-chat': { isActive: true, participantCount: 5, moderatorCount: 2 }
        })
      })

      it('should return only public communities with active voice chat when onlyWithActiveVoiceChat is true', async () => {
        const result = await communityComponent.getCommunitiesPublicInformation(optionsWithVoiceChat)

        expect(result.communities).toHaveLength(1)
        expect(result.communities[0].id).toBe('public-community-with-voice-chat')
        expect(result.total).toBe(1)

        expect(mockCommsGatekeeper.getAllActiveCommunityVoiceChats).toHaveBeenCalled()
        expect(mockCommsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalledWith([
          'public-community-with-voice-chat'
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
          mockCommsGatekeeper.getAllActiveCommunityVoiceChats.mockRejectedValueOnce(
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
          mockCommsGatekeeper.getAllActiveCommunityVoiceChats.mockResolvedValueOnce(null)
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
          expect(mockCommunityComplianceValidator.validateCommunityContent).toHaveBeenCalledWith({
            name: communityData.name,
            description: communityData.description,
            thumbnailBuffer: undefined
          })
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

          expect(mockCommunityComplianceValidator.validateCommunityContent).toHaveBeenCalledWith({
            name: communityData.name,
            description: communityData.description,
            thumbnailBuffer: thumbnail
          })
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
          expect(mockCommunityComplianceValidator.validateCommunityContent).toHaveBeenCalledWith({
            name: communityData.name,
            description: communityData.description,
            thumbnailBuffer: thumbnail
          })
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
            expect(mockCommunityComplianceValidator.validateCommunityContent).not.toHaveBeenCalled()
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
        expect(mockCommunityComplianceValidator.validateCommunityContent).not.toHaveBeenCalled()
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
      mockCommunitiesDB.getCommunityMembers.mockResolvedValue([])
      mockCommunityBroadcaster.broadcast.mockResolvedValue()
      mockPubSub.publishInChannel.mockResolvedValue()
    })

    afterEach(() => {
      jest.resetAllMocks()
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

        it('should not publish a community deleted content violation event ', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          await new Promise((resolve) => setImmediate(resolve))
          expect(mockCommunityBroadcaster.broadcast).not.toHaveBeenCalledWith({
            type: Events.Type.COMMUNITY,
            subType: Events.SubType.Community.DELETED_CONTENT_VIOLATION,
            key: expect.stringContaining(`${communityId}-${userAddress}`),
            timestamp: expect.any(Number),
            metadata: {
              id: communityId,
              name: community.name,
              ownerAddress: userAddress,
              thumbnailUrl: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
            }
          })
        })

        describe('and the community has some members', () => {
          let mockMembers: CommunityMember[]

          beforeEach(() => {
            mockMembers = [
              {
                communityId,
                memberAddress: '0xmember1',
                role: CommunityRole.Member,
                joinedAt: new Date().toISOString()
              },
              {
                communityId,
                memberAddress: '0xmember2',
                role: CommunityRole.Member,
                joinedAt: new Date().toISOString()
              }
            ]
            mockCommunitiesDB.getCommunityMembers.mockResolvedValueOnce(mockMembers)
          })

          it('should fetch all community members in batches', async () => {
            await communityComponent.deleteCommunity(communityId, userAddress)

            await new Promise((resolve) => setImmediate(resolve))
            expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
              pagination: { limit: 100, offset: 0 }
            })
          })

          it('should publish offline status updates for all community members', async () => {
            await communityComponent.deleteCommunity(communityId, userAddress)

            await new Promise((resolve) => setImmediate(resolve))
            expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
              communityId,
              memberAddress: '0xmember1',
              status: ConnectivityStatus.OFFLINE
            })
            expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
              communityId,
              memberAddress: '0xmember2',
              status: ConnectivityStatus.OFFLINE
            })
          })
        })
      })

      describe('and the user is a global moderator', () => {
        beforeEach(() => {
          community.role = CommunityRole.Member
          community.ownerAddress = '0xother-owner'
          mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(
            `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
          )
          mockFeatureFlags.getVariants.mockResolvedValueOnce([userAddress.toLowerCase(), '0xanother-moderator'])
        })

        it('should delete the community when user is a global moderator', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDB.deleteCommunity).toHaveBeenCalledWith(communityId)
          expect(mockFeatureFlags.getVariants).toHaveBeenCalledWith(FeatureFlag.COMMUNITIES_GLOBAL_MODERATORS)
        })

        it('should not publish a community deleted event when deleted by global moderator', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          // Wait for setImmediate callback to execute
          await new Promise((resolve) => setImmediate(resolve))
          expect(mockCommunityBroadcaster.broadcast).not.toHaveBeenCalledWith({
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

        it('should publish a community deleted content violation event ', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          await new Promise((resolve) => setImmediate(resolve))
          expect(mockCommunityBroadcaster.broadcast).toHaveBeenLastCalledWith({
            type: Events.Type.COMMUNITY,
            subType: Events.SubType.Community.DELETED_CONTENT_VIOLATION,
            key: communityId,
            timestamp: expect.any(Number),
            metadata: {
              id: communityId,
              name: community.name,
              ownerAddress: community.ownerAddress,
              thumbnailUrl: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
            }
          })
        })

        it('should not publish a community deleted event without content violation when deleted by global moderator', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          await new Promise((resolve) => setImmediate(resolve))
          expect(mockCommunityBroadcaster.broadcast).not.toHaveBeenCalledWith({
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

        describe('and the community has some members', () => {
          let mockMembers: CommunityMember[]

          beforeEach(() => {
            mockMembers = [
              {
                communityId,
                memberAddress: '0xmember1',
                role: CommunityRole.Member,
                joinedAt: new Date().toISOString()
              },
              {
                communityId,
                memberAddress: '0xmember2',
                role: CommunityRole.Member,
                joinedAt: new Date().toISOString()
              }
            ]
            mockCommunitiesDB.getCommunityMembers.mockResolvedValueOnce(mockMembers)
          })

          it('should fetch all community members in batches', async () => {
            await communityComponent.deleteCommunity(communityId, userAddress)

            await new Promise((resolve) => setImmediate(resolve))
            expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
              pagination: { limit: 100, offset: 0 }
            })
          })

          it('should publish offline status updates for all community members', async () => {
            await communityComponent.deleteCommunity(communityId, userAddress)

            await new Promise((resolve) => setImmediate(resolve))
            expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
              communityId,
              memberAddress: '0xmember1',
              status: ConnectivityStatus.OFFLINE
            })
            expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL, {
              communityId,
              memberAddress: '0xmember2',
              status: ConnectivityStatus.OFFLINE
            })
          })
        })

        describe('and the community has many members', () => {
          let firstBatch: CommunityMember[]
          let secondBatch: CommunityMember[]

          beforeEach(() => {
            // Create 100 members for first batch and 50 for second batch
            firstBatch = Array.from({ length: 100 }, (_, i) => ({
              communityId,
              memberAddress: `0xmember${i}`,
              role: CommunityRole.Member,
              joinedAt: new Date().toISOString()
            }))
            secondBatch = Array.from({ length: 50 }, (_, i) => ({
              communityId,
              memberAddress: `0xmember${i + 100}`,
              role: CommunityRole.Member,
              joinedAt: new Date().toISOString()
            }))

            mockCommunitiesDB.getCommunityMembers.mockResolvedValueOnce(firstBatch).mockResolvedValueOnce(secondBatch)
          })

          it('should handle pagination when fetching members', async () => {
            await communityComponent.deleteCommunity(communityId, userAddress)

            await new Promise((resolve) => setImmediate(resolve))
            expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
              pagination: { limit: 100, offset: 0 }
            })
            expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith(communityId, {
              pagination: { limit: 100, offset: 100 }
            })
          })

          it('should publish offline status for all members across multiple pages', async () => {
            await communityComponent.deleteCommunity(communityId, userAddress)

            await new Promise((resolve) => setImmediate(resolve))
            expect(mockPubSub.publishInChannel).toHaveBeenCalledTimes(150) // 100 + 50 members
            expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(
              COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL,
              expect.objectContaining({
                communityId,
                status: ConnectivityStatus.OFFLINE
              })
            )
          })
        })

        describe('and the community has no members', () => {
          beforeEach(() => {
            mockCommunitiesDB.getCommunityMembers.mockResolvedValueOnce([])
          })

          it('should not publish any offline status updates', async () => {
            await communityComponent.deleteCommunity(communityId, userAddress)

            await new Promise((resolve) => setImmediate(resolve))
            expect(mockPubSub.publishInChannel).not.toHaveBeenCalledWith(
              COMMUNITY_MEMBER_STATUS_UPDATES_CHANNEL,
              expect.any(Object)
            )
          })
        })
      })

      describe('and the user is not the owner and not a global moderator', () => {
        beforeEach(() => {
          community.role = CommunityRole.Member
          community.ownerAddress = '0xother-owner'
          mockFeatureFlags.getVariants.mockResolvedValueOnce(['0xanother-moderator', '0xthird-moderator'])
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow(
            new NotAuthorizedError("The user doesn't have permission to delete this community")
          )

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDB.deleteCommunity).not.toHaveBeenCalled()
          expect(mockFeatureFlags.getVariants).toHaveBeenCalledWith(FeatureFlag.COMMUNITIES_GLOBAL_MODERATORS)
        })
      })

      describe('and the user is a member', () => {
        beforeEach(() => {
          community.role = CommunityRole.Member
          community.ownerAddress = '0xother-owner'
          // Mock feature flags to return empty global moderators list
          mockFeatureFlags.getVariants.mockResolvedValueOnce([])
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow(
            new NotAuthorizedError("The user doesn't have permission to delete this community")
          )

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDB.deleteCommunity).not.toHaveBeenCalled()
          expect(mockFeatureFlags.getVariants).toHaveBeenCalledWith(FeatureFlag.COMMUNITIES_GLOBAL_MODERATORS)
        })
      })

      describe('and the user is a moderator', () => {
        beforeEach(() => {
          community.role = CommunityRole.Moderator
          community.ownerAddress = '0xother-owner'
          // Mock feature flags to return empty global moderators list
          mockFeatureFlags.getVariants.mockResolvedValueOnce([])
        })

        it('should throw NotAuthorizedError when user is not a global moderator', async () => {
          await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow(
            new NotAuthorizedError("The user doesn't have permission to delete this community")
          )

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDB.deleteCommunity).not.toHaveBeenCalled()
          expect(mockFeatureFlags.getVariants).toHaveBeenCalledWith(FeatureFlag.COMMUNITIES_GLOBAL_MODERATORS)
        })
      })

      describe('and global moderators feature flag returns malformed data', () => {
        beforeEach(() => {
          community.role = CommunityRole.Member
          community.ownerAddress = '0xother-owner'
          // Mock feature flags to return malformed global moderators list
          mockFeatureFlags.getVariants.mockResolvedValueOnce(['  ', '  ', 'invalid-address', '  '])
        })

        it('should handle malformed global moderators config gracefully', async () => {
          await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow(
            new NotAuthorizedError("The user doesn't have permission to delete this community")
          )

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDB.deleteCommunity).not.toHaveBeenCalled()
          expect(mockFeatureFlags.getVariants).toHaveBeenCalledWith(FeatureFlag.COMMUNITIES_GLOBAL_MODERATORS)
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
            mockCommunityRoles.validatePermissionToUpdateCommunityPrivacy.mockResolvedValue()
            mockCommunityRoles.validatePermissionToEditCommunityName.mockResolvedValue()
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

            expect(mockCommunityComplianceValidator.validateCommunityContent).toHaveBeenCalledWith({
              name: updates.name,
              description: updates.description,
              thumbnailBuffer: updates.thumbnailBuffer
            })
            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(updates.placeIds, userAddress)
            expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updates)
            expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith(communityId, updates.thumbnailBuffer)
            expect(mockCdnCacheInvalidator.invalidateThumbnail).toHaveBeenCalledWith(communityId)
            expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(communityId, userAddress, updates.placeIds)
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

            expect(mockCommunityComplianceValidator.validateCommunityContent).toHaveBeenCalledWith({
              name: updatesWithOnlyContent.name,
              description: updatesWithOnlyContent.description,
              thumbnailBuffer: undefined
            })
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

            expect(mockCommunityComplianceValidator.validateCommunityContent).not.toHaveBeenCalled()
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

            expect(mockCommunityComplianceValidator.validateCommunityContent).not.toHaveBeenCalled()
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

            expect(mockCommunityComplianceValidator.validateCommunityContent).toHaveBeenCalledWith({
              name: undefined,
              description: simpleUpdate.description,
              thumbnailBuffer: undefined
            })
          })

          it('should update the community with only name and call compliance validation', async () => {
            const nameOnlyUpdate = {
              name: 'Updated Name Only'
            }

            mockCommunitiesDB.updateCommunity.mockResolvedValueOnce({
              ...mockCommunity,
              ...nameOnlyUpdate
            })

            const result = await communityComponent.updateCommunity(communityId, userAddress, nameOnlyUpdate)

            expect(result).toEqual({
              ...mockCommunity,
              ...nameOnlyUpdate
            })

            expect(mockCommunityComplianceValidator.validateCommunityContent).toHaveBeenCalledWith({
              name: nameOnlyUpdate.name,
              description: undefined,
              thumbnailBuffer: undefined
            })
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

            expect(mockCommunityComplianceValidator.validateCommunityContent).toHaveBeenCalledWith({
              name: completeUpdate.name,
              description: completeUpdate.description,
              thumbnailBuffer: completeUpdate.thumbnailBuffer
            })
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

            await new Promise((resolve) => setImmediate(resolve))

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
              expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                communityId,
                userAddress
              )
              expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(updates.placeIds, userAddress)
              expect(mockCommunityComplianceValidator.validateCommunityContent).not.toHaveBeenCalled()
              expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
            })
          })

          describe('and the community privacy is updated from private to public', () => {
            let updatesWithPrivacyPublic: CommunityUpdates

            beforeEach(() => {
              updatesWithPrivacyPublic = { ...updates, privacy: CommunityPrivacyEnum.Public }
              mockCommunitiesDB.getCommunity.mockResolvedValueOnce({
                ...mockCommunity,
                privacy: CommunityPrivacyEnum.Private,
                role: CommunityRole.Owner
              })
            })

            it('should migrate all requests to join to members', async () => {
              await communityComponent.updateCommunity(communityId, userAddress, updatesWithPrivacyPublic)

              expect(mockCommunitiesDB.acceptAllRequestsToJoin).toHaveBeenCalledWith(communityId)
            })
          })

          describe('and the community privacy is updated from public to private', () => {
            let updatesWithPrivacyPrivate: CommunityUpdates

            beforeEach(() => {
              updatesWithPrivacyPrivate = { ...updates, privacy: CommunityPrivacyEnum.Private }
              mockCommunitiesDB.getCommunity.mockResolvedValueOnce({
                ...mockCommunity,
                privacy: CommunityPrivacyEnum.Public,
                role: CommunityRole.Owner
              })
            })

            it('should not migrate all requests to join to members', async () => {
              await communityComponent.updateCommunity(communityId, userAddress, updatesWithPrivacyPrivate)

              expect(mockCommunitiesDB.acceptAllRequestsToJoin).not.toHaveBeenCalled()
            })
          })
        })

        describe('and the name is being changed', () => {
          const nameUpdateOnly = { name: 'New Community Name' }
          let existingCommunity: any

          beforeEach(() => {
            existingCommunity = { ...mockCommunity, name: 'Original Name' }
            mockCommunitiesDB.getCommunity.mockResolvedValue(existingCommunity)
            mockCommunitiesDB.updateCommunity.mockResolvedValue({ ...existingCommunity, ...nameUpdateOnly })
          })

          describe('and the user has permission to edit community names', () => {
            beforeEach(() => {
              mockCommunityRoles.validatePermissionToEditCommunityName.mockResolvedValue()
            })

            it('should call validatePermissionToEditCommunityName', async () => {
              await communityComponent.updateCommunity(communityId, userAddress, nameUpdateOnly)

              expect(mockCommunityRoles.validatePermissionToEditCommunityName).toHaveBeenCalledWith(
                communityId,
                userAddress
              )
            })

            it('should update the community name successfully', async () => {
              const result = await communityComponent.updateCommunity(communityId, userAddress, nameUpdateOnly)

              expect(result).toEqual({ ...existingCommunity, ...nameUpdateOnly })
              expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, nameUpdateOnly)
            })
          })

          describe('and the user does not have permission to edit community names', () => {
            let permissionError: Error

            beforeEach(() => {
              permissionError = new Error('User does not have permission to edit community name')
              mockCommunityRoles.validatePermissionToEditCommunityName.mockRejectedValue(permissionError)
            })

            it('should throw the permission error', async () => {
              await expect(
                communityComponent.updateCommunity(communityId, userAddress, nameUpdateOnly)
              ).rejects.toThrow('User does not have permission to edit community name')
            })

            it('should not update the community', async () => {
              await expect(
                communityComponent.updateCommunity(communityId, userAddress, nameUpdateOnly)
              ).rejects.toThrow()

              expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
            })
          })
        })

        describe('and the name is not being changed', () => {
          const updatesWithoutName = { description: 'Updated Description' }
          let existingCommunity: any

          beforeEach(() => {
            existingCommunity = { ...mockCommunity, name: 'Original Name' }
            mockCommunitiesDB.getCommunity.mockResolvedValue(existingCommunity)
            mockCommunitiesDB.updateCommunity.mockResolvedValue({ ...existingCommunity, ...updatesWithoutName })
          })

          it('should not call validatePermissionToEditCommunityName', async () => {
            await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutName)

            expect(mockCommunityRoles.validatePermissionToEditCommunityName).not.toHaveBeenCalled()
          })

          it('should update the community successfully', async () => {
            const result = await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutName)

            expect(result).toEqual({ ...existingCommunity, ...updatesWithoutName })
            expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updatesWithoutName)
          })
        })

        describe('and the name provided is the same as existing (with whitespace differences)', () => {
          const sameNameWithSpaces = { name: '  Test Community  ' }
          let existingCommunity: any

          beforeEach(() => {
            existingCommunity = { ...mockCommunity, name: 'Test Community' }
            mockCommunitiesDB.getCommunity.mockResolvedValue(existingCommunity)
            mockCommunitiesDB.updateCommunity.mockResolvedValue({ ...existingCommunity, name: existingCommunity.name })
          })

          it('should not call validatePermissionToEditCommunityName when trimmed names are identical', async () => {
            await communityComponent.updateCommunity(communityId, userAddress, sameNameWithSpaces)

            expect(mockCommunityRoles.validatePermissionToEditCommunityName).not.toHaveBeenCalled()
          })

          it('should update the community successfully', async () => {
            const result = await communityComponent.updateCommunity(communityId, userAddress, sameNameWithSpaces)

            expect(result).toEqual({ ...existingCommunity, name: existingCommunity.name })
            expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, sameNameWithSpaces)
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
            expect(mockCommunityComplianceValidator.validateCommunityContent).not.toHaveBeenCalled()
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

      it('should return the existing community fields', async () => {
        const result = await communityComponent.updateCommunity(communityId, userAddress, emptyUpdates)

        expect(result).toEqual({
          id: mockCommunity.id,
          name: mockCommunity.name,
          description: mockCommunity.description,
          ownerAddress: mockCommunity.ownerAddress,
          privacy: mockCommunity.privacy,
          active: mockCommunity.active
        })

        expect(mockCommunityComplianceValidator.validateCommunityContent).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunityRoles.validatePermissionToUpdateCommunityPrivacy).not.toHaveBeenCalled()
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

  describe('when getting community invites', () => {
    let inviterAddress: string
    let inviteeAddress: string

    beforeEach(() => {
      inviterAddress = '0x1234567890123456789012345678901234567890'
      inviteeAddress = '0x9876543210987654321098765432109876543210'
    })

    describe('and invites are available', () => {
      let mockCommunityInvites: Community[]

      beforeEach(() => {
        mockCommunityInvites = [
          {
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0x1111111111111111111111111111111111111111',
            privacy: CommunityPrivacyEnum.Public,
            active: true,
            thumbnails: {
              raw: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
            }
          },
          {
            id: 'community-2',
            name: 'Another Community',
            description: 'Another Description',
            ownerAddress: inviterAddress,
            privacy: CommunityPrivacyEnum.Private,
            active: true
          }
        ]
        mockCommunitiesDB.getCommunityInvites.mockResolvedValue(mockCommunityInvites)
      })

      it('should return communities where inviter is owner/moderator but invitee is not', async () => {
        const result = await communityComponent.getCommunityInvites(inviterAddress, inviteeAddress)

        expect(result).toEqual([
          {
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0x1111111111111111111111111111111111111111',
            privacy: CommunityPrivacyEnum.Public,
            active: true,
            thumbnails: {
              raw: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
            }
          },
          {
            id: 'community-2',
            name: 'Another Community',
            description: 'Another Description',
            ownerAddress: inviterAddress,
            privacy: CommunityPrivacyEnum.Private,
            active: true,
            thumbnails: undefined
          }
        ])

        expect(mockCommunitiesDB.getCommunityInvites).toHaveBeenCalledWith(inviterAddress, inviteeAddress)
      })
    })

    describe('and no invites are available', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityInvites.mockResolvedValue([])
      })

      it('should return empty array', async () => {
        const result = await communityComponent.getCommunityInvites(inviterAddress, inviteeAddress)

        expect(result).toEqual([])
        expect(mockCommunitiesDB.getCommunityInvites).toHaveBeenCalledWith(inviterAddress, inviteeAddress)
      })
    })
  })

  describe('when getting all communities for moderation', () => {
    const options = { pagination: { limit: 10, offset: 0 }, search: 'test' }
    const mockModerationCommunities = [
      {
        id: 'community-1',
        name: 'Test Community 1',
        description: 'Test Description 1',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        privacy: CommunityPrivacyEnum.Public,
        active: true,
        membersCount: 10,
        createdAt: '2023-01-01T00:00:00Z'
      },
      {
        id: 'community-2',
        name: 'Test Community 2',
        description: 'Test Description 2',
        ownerAddress: '0x0987654321098765432109876543210987654321',
        privacy: CommunityPrivacyEnum.Private,
        active: true,
        membersCount: 5,
        createdAt: '2023-01-02T00:00:00Z'
      }
    ]

    beforeEach(() => {
      mockCommunitiesDB.getAllCommunitiesForModeration.mockResolvedValue(mockModerationCommunities)
      mockCommunitiesDB.getAllCommunitiesForModerationCount.mockResolvedValue(2)
      mockCommunityThumbnail.getThumbnails.mockResolvedValue({})
    })

    describe('when getting communities without thumbnails', () => {
      it('should return communities with total count for moderation purposes', async () => {
        const result = await communityComponent.getAllCommunitiesForModeration(options)

        expect(result).toEqual({
          communities: mockModerationCommunities,
          total: 2
        })

        expect(mockCommunitiesDB.getAllCommunitiesForModeration).toHaveBeenCalledWith(options)
        expect(mockCommunitiesDB.getAllCommunitiesForModerationCount).toHaveBeenCalledWith({ search: 'test' })
        expect(mockCommunityThumbnail.getThumbnails).toHaveBeenCalledWith(['community-1', 'community-2'])
      })
    })

    describe('when getting communities with thumbnails', () => {
      beforeEach(() => {
        mockCommunityThumbnail.getThumbnails.mockResolvedValue({
          'community-1': `${cdnUrl}/social/communities/community-1/raw-thumbnail.png`,
          'community-2': `${cdnUrl}/social/communities/community-2/raw-thumbnail.png`
        })
      })

      it('should return communities with thumbnails when they exist using batch method', async () => {
        const result = await communityComponent.getAllCommunitiesForModeration(options)

        expect(mockCommunityThumbnail.getThumbnails).toHaveBeenCalledWith(['community-1', 'community-2'])
        expect(result.communities[0].thumbnails).toEqual({
          raw: `${cdnUrl}/social/communities/community-1/raw-thumbnail.png`
        })
        expect(result.communities[1].thumbnails).toEqual({
          raw: `${cdnUrl}/social/communities/community-2/raw-thumbnail.png`
        })
        expect(result.total).toBe(2)
      })
    })

    describe('when handling empty communities array', () => {
      beforeEach(() => {
        mockCommunitiesDB.getAllCommunitiesForModeration.mockResolvedValue([])
        mockCommunitiesDB.getAllCommunitiesForModerationCount.mockResolvedValue(0)
      })

      it('should handle empty communities array gracefully', async () => {
        const result = await communityComponent.getAllCommunitiesForModeration(options)

        expect(result).toEqual({
          communities: [],
          total: 0
        })

        expect(mockCommunitiesDB.getAllCommunitiesForModeration).toHaveBeenCalledWith(options)
        expect(mockCommunitiesDB.getAllCommunitiesForModerationCount).toHaveBeenCalledWith({ search: 'test' })
        expect(mockCommunityThumbnail.getThumbnails).toHaveBeenCalledWith([])
      })
    })

    describe('when handling search options', () => {
      it('should handle search options correctly', async () => {
        const searchOptions = { pagination: { limit: 20, offset: 40 }, search: 'another' }

        await communityComponent.getAllCommunitiesForModeration(searchOptions)

        expect(mockCommunitiesDB.getAllCommunitiesForModeration).toHaveBeenCalledWith(searchOptions)
        expect(mockCommunitiesDB.getAllCommunitiesForModerationCount).toHaveBeenCalledWith({ search: 'another' })
      })

      it('should handle options without search parameter', async () => {
        const optionsWithoutSearch = { pagination: { limit: 15, offset: 0 } }

        await communityComponent.getAllCommunitiesForModeration(optionsWithoutSearch)

        expect(mockCommunitiesDB.getAllCommunitiesForModeration).toHaveBeenCalledWith(optionsWithoutSearch)
        expect(mockCommunitiesDB.getAllCommunitiesForModerationCount).toHaveBeenCalledWith({})
      })
    })
  })
})
