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
  ICommunityBroadcasterComponent
} from '../../../src/logic/community/types'
import {
  createMockCommunityRolesComponent,
  createMockCommunityPlacesComponent,
  createMockCommunityOwnersComponent,
  createMockCommunityEventsComponent,
  createMockCommunityBroadcasterComponent,
  createMockCommunityThumbnailComponent
} from '../../mocks/communities'
import { createMockProfile } from '../../mocks/profile'
import { Community } from '../../../src/logic/community/types'
import { createCommsGatekeeperMockedComponent } from '../../mocks/components/comms-gatekeeper'
import { Events } from '@dcl/schemas'

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
  let mockUserAddress: string
  const communityId = 'test-community'
  const cdnUrl = 'https://cdn.decentraland.org'
  const mockCommunity: Community = {
    id: communityId,
    name: 'Test Community',
    description: 'Test Description',
    ownerAddress: '0x1234567890123456789012345678901234567890',
    privacy: 'public',
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
    mockConfig.requireString.mockResolvedValue(cdnUrl)
    mockCommunityThumbnail.buildThumbnailUrl.mockImplementation((communityId: string) => `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`)
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
      communityThumbnail: mockCommunityThumbnail
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
        const result = await communityComponent.getCommunity(communityId, userAddress)

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
          mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(`${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`)
        })

        it('should include thumbnail when it exists', async () => {
          const result = await communityComponent.getCommunity(communityId, userAddress)

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
          const result = await communityComponent.getCommunity(communityId, userAddress)

          expect(result.voiceChatStatus).toBeNull()
        })
      })

      describe('when the community is hosting live events', () => {
        beforeEach(() => {
          mockCommunityEvents.isCurrentlyHostingEvents.mockResolvedValue(true)
        })

        it('should include isHostingLiveEvent when community is hosting live events', async () => {
          const result = await communityComponent.getCommunity(communityId, userAddress)

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
        await expect(communityComponent.getCommunity(communityId, userAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        // Both calls happen in parallel, so both will be called
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

    describe('and the communities have a thumbnail', () => {
      beforeEach(() => {
        mockCommunities.forEach(() => {
          mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(`${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`)
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

        // Mock voice chat status - first community has active voice chat, second doesn't
        mockCommsGatekeeper.getCommunityVoiceChatStatus
          .mockResolvedValueOnce({ isActive: true, participantCount: 3, moderatorCount: 1 })
          .mockResolvedValueOnce({ isActive: false, participantCount: 0, moderatorCount: 0 })

        // Mock batch voice chat status method
        mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockImplementation(async (communityIds: string[]) => {
          const result: Record<string, any> = {}
          communityIds.forEach((communityId) => {
            if (communityId === 'community-with-voice-chat') {
              result[communityId] = { isActive: true, participantCount: 3, moderatorCount: 1 }
            } else {
              result[communityId] = { isActive: false, participantCount: 0, moderatorCount: 0 }
            }
          })
          return result
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

      describe('when voice chat status check fails', () => {
        beforeEach(() => {
          // Reset the mock to simulate one success and one failure
          mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockReset()
          mockCommsGatekeeper.getCommunitiesVoiceChatStatus
            .mockResolvedValueOnce({
              'community-with-voice-chat': { isActive: true, participantCount: 3, moderatorCount: 1 },
              'community-without-voice-chat': { isActive: false, participantCount: 0, moderatorCount: 0 }
            })
            .mockRejectedValueOnce(new Error('Voice chat service unavailable'))
        })

        it('should exclude communities where status check fails', async () => {
          const result = await communityComponent.getCommunities(userAddress, optionsWithVoiceChat)

          expect(result.communities).toHaveLength(1)
          expect(result.communities[0].id).toBe('community-with-voice-chat')
          expect(result.total).toBe(1)
        })
      })
    })
  })

  describe('when getting public communities', () => {
    const options = { pagination: { limit: 10, offset: 0 }, search: 'test' }
    const mockCommunities = [
      {
        id: communityId,
        name: 'Test Community',
        description: 'Test Description',
        ownerAddress: '0x1234567890123456789012345678901234567890',
        privacy: 'public' as const,
        active: true,
        role: CommunityRole.Member,
        membersCount: 10,
        isHostingLiveEvent: false,
        voiceChatStatus: {
          isActive: false,
          participantCount: 0,
          moderatorCount: 0
        }
      }
    ]

    beforeEach(() => {
      mockCommunitiesDB.getCommunitiesPublicInformation.mockResolvedValue(mockCommunities)
      mockCommunitiesDB.getPublicCommunitiesCount.mockResolvedValue(1)
      mockCommunityOwners.getOwnerName.mockResolvedValue('Test Owner Name')
    })

    describe('when the community is not hosting live events', () => {
      beforeEach(() => {
        mockCommunityEvents.isCurrentlyHostingEvents.mockResolvedValueOnce(false)
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
              privacy: 'public',
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
    })

    describe('and the communities have a thumbnail', () => {
      beforeEach(() => {
        mockCommunities.forEach(() => {
          mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(`${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`)
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
      const mockCommunitiesWithVoiceChat = [
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

        // Mock voice chat status - first community has active voice chat, second doesn't
        mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValueOnce({
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

      describe('when voice chat status check fails', () => {
        beforeEach(() => {
          // Reset the mock to simulate one success and one failure
          mockCommsGatekeeper.getCommunityVoiceChatStatus.mockReset()
          mockCommsGatekeeper.getCommunityVoiceChatStatus
            .mockResolvedValueOnce({ isActive: true, participantCount: 5, moderatorCount: 2 })
            .mockRejectedValueOnce(new Error('Voice chat service unavailable'))
        })

        it('should exclude public communities where status check fails', async () => {
          const result = await communityComponent.getCommunitiesPublicInformation(optionsWithVoiceChat)

          expect(result.communities).toHaveLength(1)
          expect(result.communities[0].id).toBe('public-community-with-voice-chat')
          expect(result.total).toBe(1)
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
        privacy: 'public',
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
      ownerAddress
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
      mockCommunityThumbnail.uploadThumbnail.mockResolvedValue(`${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`)
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

        describe('and no thumbnail is provided', () => {
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
        })

        describe('and a thumbnail is provided', () => {
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

            expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
            expect(mockCommunityOwners.getOwnerName).toHaveBeenCalledWith(ownerAddress)
            expect(mockCommunityPlaces.validateOwnership).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.createCommunity).toHaveBeenCalledWith({
              ...communityData,
              owner_address: ownerAddress,
              private: false,
              active: true
            })
            expect(mockCommunitiesDB.addCommunityMember).toHaveBeenCalledWith({
              communityId: newCommunityId,
              memberAddress: ownerAddress,
              role: CommunityRole.Owner
            })
            expect(mockCommunityPlaces.addPlaces).not.toHaveBeenCalled()
            expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith(newCommunityId, thumbnail)
          })
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

        describe('and the user owns all places', () => {
          describe('and no thumbnail is provided', () => {
            it('should create community successfully with places', async () => {
              const result = await communityComponent.createCommunity(communityData, undefined, placeIds)

              expect(result).toEqual({
                ...mockCommunity,
                ...communityData,
                id: 'new-community-id',
                ownerName: 'Test Owner Name',
                isHostingLiveEvent: false
              })

              expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
              expect(mockCommunityOwners.getOwnerName).toHaveBeenCalledWith(ownerAddress)
              expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(placeIds, ownerAddress)
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
              expect(mockCommunityPlaces.addPlaces).toHaveBeenCalledWith('new-community-id', ownerAddress, placeIds)
              expect(mockCommunityThumbnail.uploadThumbnail).not.toHaveBeenCalled()
            })
          })

          describe('and a thumbnail is provided', () => {
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

              expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
              expect(mockCommunityOwners.getOwnerName).toHaveBeenCalledWith(ownerAddress)
              expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(placeIds, ownerAddress)
              expect(mockCommunitiesDB.createCommunity).toHaveBeenCalledWith({
                ...communityData,
                owner_address: ownerAddress,
                private: false,
                active: true
              })
              expect(mockCommunitiesDB.addCommunityMember).toHaveBeenCalledWith({
                communityId: newCommunityId,
                memberAddress: ownerAddress,
                role: CommunityRole.Owner
              })
              expect(mockCommunityPlaces.addPlaces).toHaveBeenCalledWith(newCommunityId, ownerAddress, placeIds)
              expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith(newCommunityId, thumbnail)
            })
          })
        })

        describe('and the user does not own all places', () => {
          beforeEach(() => {
            mockCommunityPlaces.validateOwnership.mockRejectedValue(
              new NotAuthorizedError(`The user ${ownerAddress} doesn't own all the places`)
            )
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(communityComponent.createCommunity(communityData, undefined, placeIds)).rejects.toThrow(
              new NotAuthorizedError(`The user ${ownerAddress} doesn't own all the places`)
            )

            expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
            expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(placeIds, ownerAddress)
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

      it('should throw NotAuthorizedError', async () => {
        await expect(communityComponent.createCommunity(communityData)).rejects.toThrow(
          new NotAuthorizedError(`The user ${ownerAddress} doesn't have any names`)
        )

        expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
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
          mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(`${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`)
        })

        it('should delete the community', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDB.deleteCommunity).toHaveBeenCalledWith(communityId)
        })

        it('should publish a community deleted event', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          // Wait for setImmediate callback to execute
          await new Promise(resolve => setImmediate(resolve))
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

      describe('and the user is a moderator', () => {
        beforeEach(() => {
          community.role = CommunityRole.Moderator
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
      mockCommunityThumbnail.uploadThumbnail.mockResolvedValue(`${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`)
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

          describe('and no places are provided', () => {
            describe('and no thumbnail is provided', () => {
              const updatesWithoutThumbnail = {
                name: 'Updated Community',
                description: 'Updated Description',
                placeIds: ['place-1', 'place-2']
              }

              beforeEach(() => {
                updatedCommunity = { ...mockCommunity, ...updatesWithoutThumbnail }
                mockCommunitiesDB.updateCommunity.mockResolvedValue(updatedCommunity)
                mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(`${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`)
              })

              it('should update the community with places', async () => {
                const result = await communityComponent.updateCommunity(
                  communityId,
                  userAddress,
                  updatesWithoutThumbnail
                )

                expect(result).toEqual({
                  ...mockCommunity,
                  ...updatesWithoutThumbnail
                })

                expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                  communityId,
                  userAddress
                )
                expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(
                  updatesWithoutThumbnail.placeIds,
                  userAddress
                )
                expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updatesWithoutThumbnail)
                expect(mockCommunityThumbnail.uploadThumbnail).not.toHaveBeenCalled()
                expect(mockCdnCacheInvalidator.invalidateThumbnail).not.toHaveBeenCalled()
                expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(
                  communityId,
                  userAddress,
                  updatesWithoutThumbnail.placeIds
                )

                // Wait for setImmediate callback to execute
                await new Promise(resolve => setImmediate(resolve))
                expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
                  type: Events.Type.COMMUNITY,
                  subType: Events.SubType.Community.RENAMED,
                  key: `${communityId}-${updatesWithoutThumbnail.name.trim().toLowerCase().replace(/ /g, '-')}-${community.name.trim().toLowerCase().replace(/ /g, '-')}`,
                  timestamp: expect.any(Number),
                  metadata: {
                    id: communityId,
                    oldName: community.name,
                    newName: updatesWithoutThumbnail.name,
                    thumbnailUrl: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
                  }
                })
              })
            })

            describe('and places are provided', () => {
              describe('and the user owns all places', () => {
                beforeEach(() => {
                  mockCommunityPlaces.validateOwnership.mockResolvedValue({
                    isValid: true,
                    ownedPlaces: updates.placeIds,
                    notOwnedPlaces: []
                  })
                })

                describe('and no thumbnail is provided', () => {
                  const updatesWithoutThumbnail = {
                    name: 'Updated Community',
                    description: 'Updated Description',
                    placeIds: ['place-1', 'place-2']
                  }

                  beforeEach(() => {
                    updatedCommunity = { ...mockCommunity, ...updatesWithoutThumbnail }
                    mockCommunitiesDB.updateCommunity.mockResolvedValue(updatedCommunity)
                  })

                  it('should update the community with places', async () => {
                    const result = await communityComponent.updateCommunity(
                      communityId,
                      userAddress,
                      updatesWithoutThumbnail
                    )

                    expect(result).toEqual({
                      ...mockCommunity,
                      ...updatesWithoutThumbnail
                    })

                    expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                    expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                      communityId,
                      userAddress
                    )
                    expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(
                      updatesWithoutThumbnail.placeIds,
                      userAddress
                    )
                    expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updatesWithoutThumbnail)
                    expect(mockCommunityThumbnail.uploadThumbnail).not.toHaveBeenCalled()
                    expect(mockCdnCacheInvalidator.invalidateThumbnail).not.toHaveBeenCalled()
                    expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(
                      communityId,
                      userAddress,
                      updatesWithoutThumbnail.placeIds
                    )
                  })
                })

                describe('and a thumbnail is provided', () => {
                  beforeEach(() => {
                    mockCommunitiesDB.getCommunityPlaces.mockResolvedValue([])
                  })

                  it('should update the community with places and thumbnail', async () => {
                    const result = await communityComponent.updateCommunity(communityId, userAddress, updates)

                    expect(result).toEqual({
                      ...mockCommunity,
                      ...updates,
                      thumbnails: {
                        raw: `https://cdn.decentraland.org/social/communities/${communityId}/raw-thumbnail.png`
                      }
                    })

                    expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                    expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                      communityId,
                      userAddress
                    )
                    expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(updates.placeIds, userAddress)
                    expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updates)
                    expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith(communityId, updates.thumbnailBuffer)
                    expect(mockCdnCacheInvalidator.invalidateThumbnail).toHaveBeenCalledWith(communityId)
                    expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(
                      communityId,
                      userAddress,
                      updates.placeIds
                    )
                  })
                })
              })

              describe('and the user does not own all places', () => {
                beforeEach(() => {
                  mockCommunitiesDB.getCommunityPlaces.mockResolvedValue([])
                  mockCommunityPlaces.validateOwnership.mockRejectedValue(
                    new NotAuthorizedError(`The user ${userAddress} doesn't own all the places`)
                  )
                })

                it('should throw NotAuthorizedError', async () => {
                  await expect(communityComponent.updateCommunity(communityId, userAddress, updates)).rejects.toThrow(
                    new NotAuthorizedError(`The user ${userAddress} doesn't own all the places`)
                  )

                  expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                  expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                    communityId,
                    userAddress
                  )
                  expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(updates.placeIds, userAddress)
                  expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
                })
              })

              describe('and empty placeIds array is provided', () => {
                const updatesWithEmptyPlaces = {
                  name: 'Updated Community',
                  description: 'Updated Description',
                  placeIds: []
                }

                beforeEach(() => {
                  updatedCommunity = { ...mockCommunity, ...updatesWithEmptyPlaces }
                  mockCommunitiesDB.updateCommunity.mockResolvedValue(updatedCommunity)
                  mockCommunityPlaces.validateOwnership.mockResolvedValue({
                    isValid: true,
                    ownedPlaces: [],
                    notOwnedPlaces: []
                  })
                })

                it('should remove all places from the community', async () => {
                  const result = await communityComponent.updateCommunity(
                    communityId,
                    userAddress,
                    updatesWithEmptyPlaces
                  )

                  expect(result).toEqual({
                    ...mockCommunity,
                    ...updatesWithEmptyPlaces
                  })

                  expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                  expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                    communityId,
                    userAddress
                  )
                  expect(mockCommunityPlaces.validateOwnership).not.toHaveBeenCalled()
                  expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updatesWithEmptyPlaces)
                  expect(mockCommunityThumbnail.uploadThumbnail).not.toHaveBeenCalled()
                  expect(mockCdnCacheInvalidator.invalidateThumbnail).not.toHaveBeenCalled()
                  expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(communityId, userAddress, [])
                })
              })

              describe('and placeIds is undefined', () => {
                const updatesWithoutPlaces = {
                  name: 'Updated Community',
                  description: 'Updated Description'
                  // placeIds is intentionally undefined
                }

                beforeEach(() => {
                  updatedCommunity = { ...mockCommunity, ...updatesWithoutPlaces }
                  mockCommunitiesDB.updateCommunity.mockResolvedValue(updatedCommunity)
                })

                it('should not update places when placeIds is undefined', async () => {
                  const result = await communityComponent.updateCommunity(
                    communityId,
                    userAddress,
                    updatesWithoutPlaces
                  )

                  expect(result).toEqual({
                    ...mockCommunity,
                    ...updatesWithoutPlaces
                  })

                  expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                  expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                    communityId,
                    userAddress
                  )
                  expect(mockCommunityPlaces.validateOwnership).not.toHaveBeenCalled()
                  expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updatesWithoutPlaces)
                  expect(mockCommunityThumbnail.uploadThumbnail).not.toHaveBeenCalled()
                  expect(mockCdnCacheInvalidator.invalidateThumbnail).not.toHaveBeenCalled()
                  expect(mockCommunityPlaces.updatePlaces).not.toHaveBeenCalled()
                })
              })

              // New tests for optimized place validation behavior
              describe('when updating with mixed existing and new places', () => {
                const existingPlaces = [{ id: 'place-1' }, { id: 'place-3' }]
                const newPlaceIds = ['place-1', 'place-2', 'place-4']
                const updatesWithMixedPlaces = {
                  name: 'Updated Community',
                  description: 'Updated Description',
                  placeIds: newPlaceIds,
                  thumbnailBuffer: Buffer.from('fake-thumbnail')
                }

                beforeEach(() => {
                  mockCommunitiesDB.getCommunityPlaces.mockResolvedValue(existingPlaces)
                  mockCommunityPlaces.validateOwnership.mockResolvedValue({
                    isValid: true,
                    ownedPlaces: ['place-2', 'place-4'], // Only new places
                    notOwnedPlaces: []
                  })
                  updatedCommunity = { ...mockCommunity, ...updatesWithMixedPlaces }
                  mockCommunitiesDB.updateCommunity.mockResolvedValue(updatedCommunity)
                })

                it('should only validate ownership for new places', async () => {
                  const result = await communityComponent.updateCommunity(
                    communityId,
                    userAddress,
                    updatesWithMixedPlaces
                  )

                  expect(result).toEqual({
                    ...mockCommunity,
                    ...updatesWithMixedPlaces,
                    thumbnails: {
                      raw: `https://cdn.decentraland.org/social/communities/${communityId}/raw-thumbnail.png`
                    }
                  })

                  expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                  expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                    communityId,
                    userAddress
                  )
                  expect(mockCommunitiesDB.getCommunityPlaces).toHaveBeenCalledWith(communityId)
                  // Should only validate ownership for place-2 and place-4 (new places)
                  expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(
                    ['place-2', 'place-4'],
                    userAddress
                  )
                  expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updatesWithMixedPlaces)
                  expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith(communityId, updatesWithMixedPlaces.thumbnailBuffer)
                  expect(mockCdnCacheInvalidator.invalidateThumbnail).toHaveBeenCalledWith(communityId)
                  expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(communityId, userAddress, newPlaceIds)
                })
              })

              describe('when updating with only existing places', () => {
                const existingPlaces = [{ id: 'place-1' }, { id: 'place-2' }]
                const updatesWithExistingPlaces = {
                  name: 'Updated Community',
                  description: 'Updated Description',
                  placeIds: ['place-1', 'place-2'],
                  thumbnailBuffer: Buffer.from('fake-thumbnail')
                }

                beforeEach(() => {
                  mockCommunitiesDB.getCommunityPlaces.mockResolvedValue(existingPlaces)
                  updatedCommunity = { ...mockCommunity, ...updatesWithExistingPlaces }
                  mockCommunitiesDB.updateCommunity.mockResolvedValue(updatedCommunity)
                })

                it('should not validate ownership when all places already exist', async () => {
                  const result = await communityComponent.updateCommunity(
                    communityId,
                    userAddress,
                    updatesWithExistingPlaces
                  )

                  expect(result).toEqual({
                    ...mockCommunity,
                    ...updatesWithExistingPlaces,
                    thumbnails: {
                      raw: `https://cdn.decentraland.org/social/communities/${communityId}/raw-thumbnail.png`
                    }
                  })

                  expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                  expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                    communityId,
                    userAddress
                  )
                  expect(mockCommunitiesDB.getCommunityPlaces).toHaveBeenCalledWith(communityId)
                  // Should not validate ownership since all places already exist
                  expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith([], userAddress)
                  expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updatesWithExistingPlaces)
                  expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith(communityId, updatesWithExistingPlaces.thumbnailBuffer)
                  expect(mockCdnCacheInvalidator.invalidateThumbnail).toHaveBeenCalledWith(communityId)
                  expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(communityId, userAddress, [
                    'place-1',
                    'place-2'
                  ])
                })
              })

              describe('when updating with duplicate place IDs', () => {
                const existingPlaces = [{ id: 'place-1' }]
                const updatesWithDuplicates = {
                  name: 'Updated Community',
                  description: 'Updated Description',
                  placeIds: ['place-1', 'place-2', 'place-2', 'place-1'], // Duplicates
                  thumbnailBuffer: Buffer.from('fake-thumbnail')
                }

                beforeEach(() => {
                  mockCommunitiesDB.getCommunityPlaces.mockResolvedValue(existingPlaces)
                  mockCommunityPlaces.validateOwnership.mockResolvedValue({
                    isValid: true,
                    ownedPlaces: ['place-2'], // Only the new unique place
                    notOwnedPlaces: []
                  })
                  updatedCommunity = { ...mockCommunity, ...updatesWithDuplicates }
                  mockCommunitiesDB.updateCommunity.mockResolvedValue(updatedCommunity)
                })

                it('should deduplicate place IDs and only validate ownership for new unique places', async () => {
                  const result = await communityComponent.updateCommunity(
                    communityId,
                    userAddress,
                    updatesWithDuplicates
                  )

                  expect(result).toEqual({
                    ...mockCommunity,
                    ...updatesWithDuplicates,
                    thumbnails: {
                      raw: `https://cdn.decentraland.org/social/communities/${communityId}/raw-thumbnail.png`
                    }
                  })

                  expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                  expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                    communityId,
                    userAddress
                  )
                  expect(mockCommunitiesDB.getCommunityPlaces).toHaveBeenCalledWith(communityId)
                  // Should only validate ownership for place-2 (new unique place)
                  expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(['place-2'], userAddress)
                  expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updatesWithDuplicates)
                  expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith(communityId, updatesWithDuplicates.thumbnailBuffer)
                  expect(mockCdnCacheInvalidator.invalidateThumbnail).toHaveBeenCalledWith(communityId)
                  expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(
                    communityId,
                    userAddress,
                    ['place-1', 'place-2', 'place-2', 'place-1'] // Original array with duplicates
                  )
                })
              })

              describe('and the user does not own some new places but owns existing ones', () => {
                const existingPlaces = [{ id: 'place-1' }]
                const updatesWithMixedOwnership = {
                  name: 'Updated Community',
                  description: 'Updated Description',
                  placeIds: ['place-1', 'place-2', 'place-3'],
                  thumbnailBuffer: Buffer.from('fake-thumbnail')
                }

                beforeEach(() => {
                  mockCommunitiesDB.getCommunityPlaces.mockResolvedValue(existingPlaces)
                  mockCommunityPlaces.validateOwnership.mockRejectedValue(
                    new NotAuthorizedError(`The user ${userAddress} doesn't own all the places`)
                  )
                })

                it('should throw NotAuthorizedError when user does not own new places', async () => {
                  await expect(
                    communityComponent.updateCommunity(communityId, userAddress, updatesWithMixedOwnership)
                  ).rejects.toThrow(new NotAuthorizedError(`The user ${userAddress} doesn't own all the places`))

                  expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                  expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                    communityId,
                    userAddress
                  )
                  expect(mockCommunitiesDB.getCommunityPlaces).toHaveBeenCalledWith(communityId)
                  // Should only validate ownership for place-2 and place-3 (new places)
                  expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(
                    ['place-2', 'place-3'],
                    userAddress
                  )
                  expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
                })
              })
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

          it('should throw NotAuthorizedError', async () => {
            await expect(communityComponent.updateCommunity(communityId, userAddress, updates)).rejects.toThrow(
              new NotAuthorizedError(`The user ${userAddress} doesn't have permission to edit the community`)
            )

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(communityId, userAddress)
            expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
          })
        })
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
