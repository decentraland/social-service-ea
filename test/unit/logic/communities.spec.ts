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
  CommunityPublicInformation
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
    privacy: CommunityPrivacyEnum.Public,
    active: true,
    thumbnails: undefined
  }

  beforeEach(async () => {
    jest.clearAllMocks()
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
      communityThumbnail: mockCommunityThumbnail
    })
  })

  describe('getCommunity', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'

    describe('when community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(null)
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValueOnce(0)
        mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValueOnce(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityComponent.getCommunity(communityId, { as: userAddress })).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )
      })

      it('should call database service', async () => {
        await expect(communityComponent.getCommunity(communityId, { as: userAddress })).rejects.toThrow()

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(communityId)
        expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
      })
    })

    describe('when community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce({
          ...mockCommunity,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValueOnce(10)
        mockCommunityOwners.getOwnerName.mockResolvedValueOnce('Test Owner Name')
      })

      describe('and community has thumbnail', () => {
        beforeEach(() => {
          mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(
            `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
          )
        })

        it('should return community with thumbnail', async () => {
          const result = await communityComponent.getCommunity(communityId, { as: userAddress })

          expect(result.thumbnails).toEqual({
            raw: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
          })
        })

        it('should call thumbnail service', async () => {
          await communityComponent.getCommunity(communityId, { as: userAddress })

          expect(mockCommunityThumbnail.getThumbnail).toHaveBeenCalledWith(communityId)
        })
      })

      describe('and community has no active voice chat', () => {
        beforeEach(() => {
          // Override the parent mock for this specific test
          mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValueOnce(null)
        })

        it('should return community with null voice chat status', async () => {
          const result = await communityComponent.getCommunity(communityId, { as: userAddress })

          expect(result.voiceChatStatus).toBeNull()
        })

        it('should call voice chat service', async () => {
          await communityComponent.getCommunity(communityId, { as: userAddress })

          expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
        })
      })

      describe('and community is hosting live events', () => {
        beforeEach(() => {
          // Override the parent mock for this specific test
          mockCommunityEvents.isCurrentlyHostingEvents.mockResolvedValueOnce(true)
        })

        it('should return community with isHostingLiveEvent true', async () => {
          const result = await communityComponent.getCommunity(communityId, { as: userAddress })

          expect(result.isHostingLiveEvent).toBe(true)
        })

        it('should call events service', async () => {
          await communityComponent.getCommunity(communityId, { as: userAddress })

          expect(mockCommunityEvents.isCurrentlyHostingEvents).toHaveBeenCalledWith(communityId)
        })
      })

      describe('and community has no special conditions', () => {
        beforeEach(() => {
          // Set up mocks for standard community conditions
          mockCommsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValueOnce({
            isActive: true,
            participantCount: 5,
            moderatorCount: 2
          })
          mockCommunityEvents.isCurrentlyHostingEvents.mockResolvedValueOnce(false)
        })

        it('should return community with all required data', async () => {
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
            voiceChatStatus: {
              isActive: true,
              participantCount: 5,
              moderatorCount: 2
            },
            ownerName: 'Test Owner Name',
            isHostingLiveEvent: false
          })
        })

        it('should call all required services', async () => {
          await communityComponent.getCommunity(communityId, { as: userAddress })

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(communityId)
          expect(mockCommsGatekeeper.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
          expect(mockCommunityOwners.getOwnerName).toHaveBeenCalledWith(mockCommunity.ownerAddress, communityId)
          expect(mockCommunityEvents.isCurrentlyHostingEvents).toHaveBeenCalledWith(communityId)
        })
      })
    })
  })

  describe('getCommunities', () => {
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

    describe('when communities exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunities.mockResolvedValueOnce(mockCommunities)
        mockCommunitiesDB.getCommunitiesCount.mockResolvedValueOnce(1)
        mockCatalystClient.getProfiles.mockResolvedValueOnce(mockProfiles)
        mockCommunityOwners.getOwnerName.mockResolvedValueOnce('Test Owner Name')
      })

      describe('and communities have thumbnails', () => {
        beforeEach(() => {
          mockCommunities.forEach(() => {
            mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(
              `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
            )
          })
        })

        it('should return communities with thumbnails', async () => {
          const result = await communityComponent.getCommunities(userAddress, options)

          expect(result.communities[0].thumbnails).toEqual({
            raw: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
          })
        })

        it('should call thumbnail service for each community', async () => {
          await communityComponent.getCommunities(userAddress, options)

          expect(mockCommunityThumbnail.getThumbnail).toHaveBeenCalledWith(communityId)
        })
      })



      describe('and there are no filters applied', () => {
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
        })

        it('should call all required services', async () => {
          await communityComponent.getCommunities(userAddress, options)

          expect(mockCommunitiesDB.getCommunities).toHaveBeenCalledWith(userAddress, options)
          expect(mockCommunitiesDB.getCommunitiesCount).toHaveBeenCalledWith(userAddress, options)
          expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1', '0xfriend2'])
          expect(mockCommunityOwners.getOwnerName).toHaveBeenCalledWith(mockCommunity.ownerAddress, communityId)
        })
      })


    })

    describe('when no communities exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunities.mockResolvedValueOnce([])
        mockCommunitiesDB.getCommunitiesCount.mockResolvedValueOnce(0)
        mockCatalystClient.getProfiles.mockResolvedValueOnce([])
      })

      it('should return empty list', async () => {
        const result = await communityComponent.getCommunities(userAddress, options)

        expect(result.communities).toHaveLength(0)
        expect(result.total).toBe(0)
      })

      it('should call database services', async () => {
        await communityComponent.getCommunities(userAddress, options)

        expect(mockCommunitiesDB.getCommunities).toHaveBeenCalledWith(userAddress, options)
        expect(mockCommunitiesDB.getCommunitiesCount).toHaveBeenCalledWith(userAddress, options)
      })
    })
  })

  describe('getCommunities with voice chat filtering', () => {
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

    describe('when communities exist', () => {
      describe('and filter by active voice chat is applied', () => {
        let optionsWithVoiceChat: any
        let mockCommunitiesWithVoiceChat: any[]

        beforeEach(() => {
          // Build context for voice chat filtering
          optionsWithVoiceChat = { ...options, onlyWithActiveVoiceChat: true }
          mockCommunitiesWithVoiceChat = [
            {
              ...mockCommunities[0],
              id: 'community-with-voice-chat'
            },
            {
              ...mockCommunities[0],
              id: 'community-without-voice-chat'
            }
          ]

          // Complete independent context setup
          mockCommunitiesDB.getCommunities.mockResolvedValueOnce(mockCommunitiesWithVoiceChat)
          mockCommunitiesDB.getCommunitiesCount.mockResolvedValueOnce(2)
          mockStorage.exists.mockResolvedValueOnce(false)
          mockCatalystClient.getProfiles.mockResolvedValueOnce([])
          mockCommunityOwners.getOwnerName.mockResolvedValueOnce('Test Owner Name')
        })

        describe('and voice chat status check fails', () => {
          beforeEach(() => {
            // Only voice chat specific mock - base data is set in parent
            mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockRejectedValueOnce(
              new Error('Voice chat service unavailable')
            )
          })

          it('should exclude communities where status check fails', async () => {
            const result = await communityComponent.getCommunities(userAddress, optionsWithVoiceChat)

            expect(result.communities).toHaveLength(0)
            expect(result.total).toBe(0)
          })

          it('should call voice chat service', async () => {
            await communityComponent.getCommunities(userAddress, optionsWithVoiceChat)

            expect(mockCommsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalledWith([
              'community-with-voice-chat',
              'community-without-voice-chat'
            ])
          })
        })

        describe('and voice chat status check succeeds', () => {
          beforeEach(() => {
            // Only voice chat specific mock - base data is set in parent
            mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValueOnce({
              'community-with-voice-chat': { isActive: true, participantCount: 3, moderatorCount: 1 },
              'community-without-voice-chat': { isActive: false, participantCount: 0, moderatorCount: 0 }
            })
          })

          it('should return only communities with active voice chat', async () => {
            const result = await communityComponent.getCommunities(userAddress, optionsWithVoiceChat)

            expect(result.communities).toHaveLength(1)
            expect(result.communities[0].id).toBe('community-with-voice-chat')
            expect(result.total).toBe(1)
          })

          it('should call voice chat service', async () => {
            await communityComponent.getCommunities(userAddress, optionsWithVoiceChat)

            expect(mockCommsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalledWith([
              'community-with-voice-chat',
              'community-without-voice-chat'
            ])
          })
        })
      })
    })
  })

  describe('getCommunitiesPublicInformation', () => {
    const options = { pagination: { limit: 10, offset: 0 }, search: 'test' }
    let mockCommunities: Omit<CommunityPublicInformation, 'ownerName'>[] = []

    describe('when communities exist', () => {
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
        mockCommunitiesDB.getCommunitiesPublicInformation.mockResolvedValueOnce(mockCommunities)
        mockCommunitiesDB.getPublicCommunitiesCount.mockResolvedValueOnce(1)
        mockCommunityOwners.getOwnerName.mockResolvedValueOnce('Test Owner Name')
      })

      describe('and communities have thumbnails', () => {
        beforeEach(() => {
          mockCommunities.forEach(() => {
            mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(
              `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
            )
          })
        })

        it('should return public communities with thumbnails', async () => {
          const result = await communityComponent.getCommunitiesPublicInformation(options)

          expect(result.communities[0].thumbnails).toEqual({
            raw: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
          })
        })

        it('should call thumbnail service for each community', async () => {
          await communityComponent.getCommunitiesPublicInformation(options)

          expect(mockCommunityThumbnail.getThumbnail).toHaveBeenCalledWith(communityId)
        })
      })



      describe('and there are no filters applied', () => {
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
        })

        it('should call all required services', async () => {
          await communityComponent.getCommunitiesPublicInformation(options)

          expect(mockCommunitiesDB.getCommunitiesPublicInformation).toHaveBeenCalledWith(options)
          expect(mockCommunitiesDB.getPublicCommunitiesCount).toHaveBeenCalledWith({ search: 'test' })
          expect(mockCommunityOwners.getOwnerName).toHaveBeenCalledWith(mockCommunity.ownerAddress, communityId)
        })
      })


    })

    describe('when no communities exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunitiesPublicInformation = jest.fn().mockResolvedValueOnce([])
        mockCommunitiesDB.getPublicCommunitiesCount = jest.fn().mockResolvedValueOnce(0)
      })

      it('should return empty list', async () => {
        const result = await communityComponent.getCommunitiesPublicInformation(options)

        expect(result.communities).toHaveLength(0)
        expect(result.total).toBe(0)
      })

      it('should call database services', async () => {
        await communityComponent.getCommunitiesPublicInformation(options)

        expect(mockCommunitiesDB.getCommunitiesPublicInformation).toHaveBeenCalledWith(options)
        expect(mockCommunitiesDB.getPublicCommunitiesCount).toHaveBeenCalledWith({ search: 'test' })
      })
    })
  })

  describe('getCommunitiesPublicInformation with voice chat filtering', () => {
    const options = { pagination: { limit: 10, offset: 0 }, search: 'test' }

    describe('when communities exist', () => {
      describe('and filtering by active voice chat', () => {
        let optionsWithVoiceChat: any
        let mockCommunitiesWithVoiceChat: Omit<CommunityPublicInformation, 'ownerName'>[]

        beforeEach(() => {
          // Build context for voice chat filtering
          optionsWithVoiceChat = { ...options, onlyWithActiveVoiceChat: true }
          mockCommunitiesWithVoiceChat = [
            {
              id: 'public-community-with-voice-chat',
              name: 'Test Community',
              description: 'Test Description',
              ownerAddress: '0x1234567890123456789012345678901234567890',
              privacy: CommunityPrivacyEnum.Public,
              active: true,
              membersCount: 10,
              isHostingLiveEvent: false
            },
            {
              id: 'public-community-without-voice-chat',
              name: 'Test Community',
              description: 'Test Description',
              ownerAddress: '0x1234567890123456789012345678901234567890',
              privacy: CommunityPrivacyEnum.Public,
              active: true,
              membersCount: 10,
              isHostingLiveEvent: false
            }
          ]

          // Complete independent context setup
          mockCommunitiesDB.getCommunitiesPublicInformation.mockResolvedValueOnce(mockCommunitiesWithVoiceChat)
          mockCommunitiesDB.getPublicCommunitiesCount.mockResolvedValueOnce(2)
          mockStorage.exists.mockResolvedValueOnce(false)
          mockCommunityOwners.getOwnerName.mockResolvedValueOnce('Test Owner Name')
        })

        describe('and voice chat status check fails', () => {
          beforeEach(() => {
            // Only voice chat specific mock - base data is set in parent
            mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockRejectedValueOnce(
              new Error('Voice chat service unavailable')
            )
          })

          it('should exclude public communities where status check fails', async () => {
            const result = await communityComponent.getCommunitiesPublicInformation(optionsWithVoiceChat)

            expect(result.communities).toHaveLength(0)
            expect(result.total).toBe(0)
          })

          it('should call voice chat service', async () => {
            await communityComponent.getCommunitiesPublicInformation(optionsWithVoiceChat)

            expect(mockCommsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalledWith([
              'public-community-with-voice-chat',
              'public-community-without-voice-chat'
            ])
          })
        })

        describe('and voice chat status check succeeds', () => {
          beforeEach(() => {
            // Only voice chat specific mock - base data is set in parent
            mockCommsGatekeeper.getCommunitiesVoiceChatStatus.mockResolvedValueOnce({
              'public-community-with-voice-chat': { isActive: true, participantCount: 5, moderatorCount: 2 },
              'public-community-without-voice-chat': { isActive: false, participantCount: 0, moderatorCount: 0 }
            })
          })

          it('should return only public communities with active voice chat', async () => {
            const result = await communityComponent.getCommunitiesPublicInformation(optionsWithVoiceChat)

            expect(result.communities).toHaveLength(1)
            expect(result.communities[0].id).toBe('public-community-with-voice-chat')
            expect(result.total).toBe(1)
          })

          it('should call voice chat service', async () => {
            await communityComponent.getCommunitiesPublicInformation(optionsWithVoiceChat)

            expect(mockCommsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalledWith([
              'public-community-with-voice-chat',
              'public-community-without-voice-chat'
            ])
          })
        })
      })
    })
  })

  describe('getMemberCommunities', () => {
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

    describe('when member has communities', () => {
      beforeEach(() => {
        mockCommunitiesDB.getMemberCommunities.mockResolvedValueOnce(mockMemberCommunities)
        mockCommunitiesDB.getCommunitiesCount.mockResolvedValueOnce(1)
      })

      it('should return member communities with total count', async () => {
        const result = await communityComponent.getMemberCommunities(memberAddress, options)

        expect(result).toEqual({
          communities: mockMemberCommunities,
          total: 1
        })
      })

      it('should call database services', async () => {
        await communityComponent.getMemberCommunities(memberAddress, options)

        expect(mockCommunitiesDB.getMemberCommunities).toHaveBeenCalledWith(memberAddress, options)
        expect(mockCommunitiesDB.getCommunitiesCount).toHaveBeenCalledWith(memberAddress, { onlyMemberOf: true })
      })
    })

    describe('when member has no communities', () => {
      beforeEach(() => {
        mockCommunitiesDB.getMemberCommunities.mockResolvedValueOnce([])
        mockCommunitiesDB.getCommunitiesCount.mockResolvedValueOnce(0)
      })

      it('should return empty list', async () => {
        const result = await communityComponent.getMemberCommunities(memberAddress, options)

        expect(result.communities).toHaveLength(0)
        expect(result.total).toBe(0)
      })

      it('should call database services', async () => {
        await communityComponent.getMemberCommunities(memberAddress, options)

        expect(mockCommunitiesDB.getMemberCommunities).toHaveBeenCalledWith(memberAddress, options)
        expect(mockCommunitiesDB.getCommunitiesCount).toHaveBeenCalledWith(memberAddress, { onlyMemberOf: true })
      })
    })
  })

  describe('createCommunity', () => {
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
      mockCommunitiesDB.createCommunity.mockResolvedValueOnce(createdCommunity)
      mockCommunitiesDB.addCommunityMember.mockResolvedValueOnce()
      mockCommunityPlaces.addPlaces.mockResolvedValueOnce()
      mockCommunityThumbnail.uploadThumbnail.mockResolvedValueOnce(
        `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
      )
      mockCommunityOwners.getOwnerName.mockResolvedValueOnce('Test Owner Name')
    })

    describe('when user has no owned names', () => {
      beforeEach(() => {
        ownedNames = []
        mockCatalystClient.getOwnedNames.mockResolvedValueOnce(ownedNames)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityComponent.createCommunity(communityData)).rejects.toThrow(
          new NotAuthorizedError(`The user ${ownerAddress} doesn't have any names`)
        )
      })

      it('should call catalyst client', async () => {
        await expect(communityComponent.createCommunity(communityData)).rejects.toThrow()

        expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
      })
    })

    describe('when user has owned names', () => {
      beforeEach(() => {
        ownedNames = [{ id: '1', name: 'test-name', contractAddress: '0xcontract', tokenId: '1' }]
        mockCatalystClient.getOwnedNames.mockResolvedValueOnce(ownedNames)
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
          it('should create community without places and thumbnail', async () => {
            const result = await communityComponent.createCommunity(communityData)

            expect(result).toEqual({
              ...mockCommunity,
              ...communityData,
              id: 'new-community-id',
              ownerName: 'Test Owner Name',
              isHostingLiveEvent: false
            })
          })

          it('should call database services', async () => {
            await communityComponent.createCommunity(communityData)

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
          })

          it('should not call place or thumbnail services', async () => {
            await communityComponent.createCommunity(communityData)

            expect(mockCommunityPlaces.validateOwnership).not.toHaveBeenCalled()
            expect(mockCommunityPlaces.addPlaces).not.toHaveBeenCalled()
            expect(mockCommunityThumbnail.uploadThumbnail).not.toHaveBeenCalled()
          })
        })

        describe('and thumbnail is provided', () => {
          it('should create community with thumbnail', async () => {
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
          })

          it('should call database services', async () => {
            await communityComponent.createCommunity(communityData, thumbnail)

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
          })

          it('should call thumbnail service', async () => {
            await communityComponent.createCommunity(communityData, thumbnail)

            expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith('new-community-id', thumbnail)
          })

          it('should not call place services', async () => {
            await communityComponent.createCommunity(communityData, thumbnail)

            expect(mockCommunityPlaces.validateOwnership).not.toHaveBeenCalled()
            expect(mockCommunityPlaces.addPlaces).not.toHaveBeenCalled()
          })
        })
      })

      describe('and places are provided', () => {
        describe('and user owns all places', () => {
          beforeEach(() => {
            mockCommunityPlaces.validateOwnership.mockResolvedValueOnce({
              isValid: true,
              ownedPlaces: placeIds,
              notOwnedPlaces: []
            })
          })

          describe('and no thumbnail is provided', () => {
            it('should create community with places', async () => {
              const result = await communityComponent.createCommunity(communityData, undefined, placeIds)

              expect(result).toEqual({
                ...mockCommunity,
                ...communityData,
                id: 'new-community-id',
                ownerName: 'Test Owner Name',
                isHostingLiveEvent: false
              })
            })

            it('should call database services', async () => {
              await communityComponent.createCommunity(communityData, undefined, placeIds)

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
            })

            it('should call place validation service', async () => {
              await communityComponent.createCommunity(communityData, undefined, placeIds)

              expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(placeIds, ownerAddress)
              expect(mockCommunityPlaces.addPlaces).toHaveBeenCalledWith('new-community-id', ownerAddress, placeIds)
            })

            it('should not call thumbnail service', async () => {
              await communityComponent.createCommunity(communityData, undefined, placeIds)

              expect(mockCommunityThumbnail.uploadThumbnail).not.toHaveBeenCalled()
            })
          })

          describe('and thumbnail is provided', () => {
            it('should create community with places and thumbnail', async () => {
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
            })

            it('should call database services', async () => {
              await communityComponent.createCommunity(communityData, thumbnail, placeIds)

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
            })

            it('should call place validation service', async () => {
              await communityComponent.createCommunity(communityData, thumbnail, placeIds)

              expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(placeIds, ownerAddress)
              expect(mockCommunityPlaces.addPlaces).toHaveBeenCalledWith('new-community-id', ownerAddress, placeIds)
            })

            it('should call thumbnail service', async () => {
              await communityComponent.createCommunity(communityData, thumbnail, placeIds)

              expect(mockCommunityThumbnail.uploadThumbnail).toHaveBeenCalledWith('new-community-id', thumbnail)
            })
          })
        })

        describe('and user does not own all places', () => {
          beforeEach(() => {
            mockCommunityPlaces.validateOwnership.mockRejectedValueOnce(
              new NotAuthorizedError(`The user ${ownerAddress} doesn't own all the places`)
            )
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(communityComponent.createCommunity(communityData, undefined, placeIds)).rejects.toThrow(
              new NotAuthorizedError(`The user ${ownerAddress} doesn't own all the places`)
            )
          })

          it('should call catalyst client', async () => {
            await expect(communityComponent.createCommunity(communityData, undefined, placeIds)).rejects.toThrow()

            expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
          })

          it('should call place validation service', async () => {
            await expect(communityComponent.createCommunity(communityData, undefined, placeIds)).rejects.toThrow()

            expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(placeIds, ownerAddress)
          })
        })
      })
    })
  })

  describe('deleteCommunity', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    let community: any

    beforeEach(() => {
      community = null
    })

    describe('when community does not exist', () => {
      beforeEach(() => {
        community = null
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(community)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )
      })

      it('should call database service', async () => {
        await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow()

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
      })
    })

    describe('when community exists', () => {
      beforeEach(() => {
        community = { ...mockCommunity }
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(community)
      })

      describe('and user is the owner', () => {
        beforeEach(() => {
          community.role = CommunityRole.Owner
          community.ownerAddress = userAddress
          mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(
            `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
          )
        })

        it('should delete the community', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          expect(mockCommunitiesDB.deleteCommunity).toHaveBeenCalledWith(communityId)
        })

        it('should call database services', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          expect(mockCommunitiesDB.deleteCommunity).toHaveBeenCalledWith(communityId)
        })

        it('should publish community deleted event', async () => {
          await communityComponent.deleteCommunity(communityId, userAddress)

          // Wait for setImmediate callback to execute
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

      describe('and user is a member', () => {
        beforeEach(() => {
          community.role = CommunityRole.Member
          community.ownerAddress = '0xother-owner'
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow(
            new NotAuthorizedError("The user doesn't have permission to delete this community")
          )
        })

        it('should call database service', async () => {
          await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow()

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        })

        it('should not call delete service', async () => {
          await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow()

          expect(mockCommunitiesDB.deleteCommunity).not.toHaveBeenCalled()
        })
      })

      describe('and user is a moderator', () => {
        beforeEach(() => {
          community.role = CommunityRole.Moderator
          community.ownerAddress = '0xother-owner'
        })

        it('should throw NotAuthorizedError', async () => {
          await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow(
            new NotAuthorizedError("The user doesn't have permission to delete this community")
          )
        })

        it('should call database service', async () => {
          await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow()

          expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        })

        it('should not call delete service', async () => {
          await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow()

          expect(mockCommunitiesDB.deleteCommunity).not.toHaveBeenCalled()
        })
      })
    })
  })

  describe('updateCommunity', () => {
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
    })

    describe('when community does not exist', () => {
      beforeEach(() => {
        community = null
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(community)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityComponent.updateCommunity(communityId, userAddress, updates)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )
      })

      it('should call database service', async () => {
        try {
          await communityComponent.updateCommunity(communityId, userAddress, updates)
        } catch (error) {
          // Expected to throw
        }

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
      })
    })

    describe('when community exists', () => {
      beforeEach(() => {
        community = { ...mockCommunity }
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(community)
      })

      describe('and no updates are provided', () => {
        beforeEach(() => {
          updatedCommunity = { ...mockCommunity }
        })

        it('should return community unchanged', async () => {
          const result = await communityComponent.updateCommunity(communityId, userAddress, {})

          expect(result).toEqual({
            id: mockCommunity.id,
            name: mockCommunity.name,
            description: mockCommunity.description,
            ownerAddress: mockCommunity.ownerAddress,
            privacy: mockCommunity.privacy,
            active: mockCommunity.active
          })
        })

        it('should not call update services', async () => {
          await communityComponent.updateCommunity(communityId, userAddress, {})

          expect(mockCommunityRoles.validatePermissionToEditCommunity).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
        })
      })

      describe('and updates are provided', () => {
        describe('and user does not have permission to edit', () => {
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
          })

          it('should call database service', async () => {
            await expect(communityComponent.updateCommunity(communityId, userAddress, updates)).rejects.toThrow()

            expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
          })

          it('should call permission validation service', async () => {
            await expect(communityComponent.updateCommunity(communityId, userAddress, updates)).rejects.toThrow()

            expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(communityId, userAddress)
          })
        })

        describe('and user has permission to edit', () => {
          beforeEach(() => {
            mockCommunityRoles.validatePermissionToEditCommunity.mockResolvedValueOnce()
            mockCommunityPlaces.validateOwnership.mockResolvedValueOnce({
              isValid: true,
              ownedPlaces: updates.placeIds,
              notOwnedPlaces: []
            })
            mockCommunityThumbnail.uploadThumbnail.mockResolvedValueOnce(
              `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
            )
            mockCommunityPlaces.updatePlaces.mockResolvedValueOnce()
            mockCommunitiesDB.getCommunityPlaces.mockResolvedValueOnce([])
          })

          describe('and no places are provided', () => {
            describe('and no thumbnail is provided', () => {
              const updatesWithoutPlaces = {
                name: 'Updated Community',
                description: 'Updated Description'
              }

              beforeEach(() => {
                updatedCommunity = { ...mockCommunity, ...updatesWithoutPlaces }
                mockCommunitiesDB.updateCommunity.mockResolvedValueOnce(updatedCommunity)
                mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(
                  `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
                )
              })

              it('should update community without places', async () => {
                const result = await communityComponent.updateCommunity(
                  communityId,
                  userAddress,
                  updatesWithoutPlaces
                )

                expect(result).toEqual({
                  ...mockCommunity,
                  ...updatesWithoutPlaces
                })
              })

              it('should call database services', async () => {
                await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutPlaces)

                expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updatesWithoutPlaces)
              })

              it('should call permission validation service', async () => {
                await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutPlaces)

                expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                  communityId,
                  userAddress
                )
              })

              it('should not call place services', async () => {
                await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutPlaces)

                expect(mockCommunityPlaces.validateOwnership).not.toHaveBeenCalled()
                expect(mockCommunityPlaces.updatePlaces).not.toHaveBeenCalled()
              })

              it('should not call thumbnail services', async () => {
                await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutPlaces)

                expect(mockCommunityThumbnail.uploadThumbnail).not.toHaveBeenCalled()
                expect(mockCdnCacheInvalidator.invalidateThumbnail).not.toHaveBeenCalled()
              })

              it('should publish community renamed event', async () => {
                await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutPlaces)

                // Wait for setImmediate callback to execute
                await new Promise((resolve) => setImmediate(resolve))
                expect(mockCommunityBroadcaster.broadcast).toHaveBeenCalledWith({
                  type: Events.Type.COMMUNITY,
                  subType: Events.SubType.Community.RENAMED,
                  key: `${communityId}-${updatesWithoutPlaces.name.trim().toLowerCase().replace(/ /g, '-')}-${community.name.trim().toLowerCase().replace(/ /g, '-')}`,
                  timestamp: expect.any(Number),
                  metadata: {
                    id: communityId,
                    oldName: community.name,
                    newName: updatesWithoutPlaces.name,
                    thumbnailUrl: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
                  }
                })
              })
            })
          })

          describe('and places are provided', () => {
            describe('and no thumbnail is provided', () => {
              const updatesWithoutThumbnail = {
                name: 'Updated Community',
                description: 'Updated Description',
                placeIds: ['place-1', 'place-2']
              }

              beforeEach(() => {
                updatedCommunity = { ...mockCommunity, ...updatesWithoutThumbnail }
                mockCommunitiesDB.updateCommunity.mockResolvedValueOnce(updatedCommunity)
                mockCommunityThumbnail.getThumbnail.mockResolvedValueOnce(
                  `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
                )
              })

              it('should update community with places', async () => {
                const result = await communityComponent.updateCommunity(
                  communityId,
                  userAddress,
                  updatesWithoutThumbnail
                )

                expect(result).toEqual({
                  ...mockCommunity,
                  ...updatesWithoutThumbnail
                })
              })

              it('should call database services', async () => {
                await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutThumbnail)

                expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
                expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updatesWithoutThumbnail)
              })

              it('should call permission validation service', async () => {
                await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutThumbnail)

                expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(
                  communityId,
                  userAddress
                )
              })

              it('should call place validation service', async () => {
                await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutThumbnail)

                expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(
                  updatesWithoutThumbnail.placeIds,
                  userAddress
                )
              })

              it('should call place update service', async () => {
                await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutThumbnail)

                expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(
                  communityId,
                  userAddress,
                  updatesWithoutThumbnail.placeIds
                )
              })

              it('should not call thumbnail services', async () => {
                await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutThumbnail)

                expect(mockCommunityThumbnail.uploadThumbnail).not.toHaveBeenCalled()
                expect(mockCdnCacheInvalidator.invalidateThumbnail).not.toHaveBeenCalled()
              })

              it('should publish community renamed event', async () => {
                await communityComponent.updateCommunity(communityId, userAddress, updatesWithoutThumbnail)

                // Wait for setImmediate callback to execute
                await new Promise((resolve) => setImmediate(resolve))
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
          })
        })
      })
    })
  })
})

