import { CommunityRole } from '../../../src/types'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs, mockCatalystClient, mockConfig } from '../../mocks/components'
import { createS3ComponentMock } from '../../mocks/components/s3'
import { createCommunityComponent } from '../../../src/logic/community/communities'
import {
  ICommunitiesComponent,
  ICommunityRolesComponent,
  ICommunityPlacesComponent
} from '../../../src/logic/community/types'
import { createMockCommunityRolesComponent, createMockCommunityPlacesComponent } from '../../mocks/community'
import { createMockProfile } from '../../mocks/profile'
import { Community } from '../../../src/logic/community/types'

describe('Community Component', () => {
  let communityComponent: ICommunitiesComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
  let mockCommunityPlaces: jest.Mocked<ICommunityPlacesComponent>
  let mockStorage: jest.Mocked<ReturnType<typeof createS3ComponentMock>>
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
    mockStorage = createS3ComponentMock() as jest.Mocked<ReturnType<typeof createS3ComponentMock>>
    mockConfig.requireString.mockResolvedValue(cdnUrl)
    communityComponent = await createCommunityComponent({
      communitiesDb: mockCommunitiesDB,
      catalystClient: mockCatalystClient,
      communityRoles: mockCommunityRoles,
      communityPlaces: mockCommunityPlaces,
      logs: mockLogs,
      storage: mockStorage,
      config: mockConfig
    })
  })

  describe('getCommunity', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValue(10)
        mockStorage.exists.mockResolvedValue(false)
      })

      it('should return community with members count', async () => {
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
          membersCount: 10
        })

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(communityId)
        expect(mockStorage.exists).toHaveBeenCalledWith(`communities/${communityId}/raw-thumbnail.png`)
      })

      it('should include thumbnail when it exists', async () => {
        mockStorage.exists.mockResolvedValueOnce(true)

        const result = await communityComponent.getCommunity(communityId, userAddress)

        expect(result.thumbnails).toEqual({
          raw: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
        })
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
        mockCommunitiesDB.getCommunityMembersCount.mockResolvedValue(0)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityComponent.getCommunity(communityId, userAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        // Both calls happen in parallel, so both will be called
        expect(mockCommunitiesDB.getCommunityMembersCount).toHaveBeenCalledWith(communityId)
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
        friends: ['0xfriend1', '0xfriend2']
      }
    ]
    const mockProfiles = [createMockProfile('0xfriend1'), createMockProfile('0xfriend2')]

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunities.mockResolvedValue(mockCommunities)
        mockCommunitiesDB.getCommunitiesCount.mockResolvedValue(1)
        mockStorage.exists.mockResolvedValue(false)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should return communities with total count', async () => {
        const result = await communityComponent.getCommunities(userAddress, options)

        expect(result).toEqual({
          communities: expect.arrayContaining([
            expect.objectContaining({
              id: mockCommunity.id,
              name: mockCommunity.name,
              description: mockCommunity.description,
              ownerAddress: mockCommunity.ownerAddress,
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
      })

      it('should include thumbnails when they exist', async () => {
        mockStorage.exists.mockResolvedValueOnce(true)

        const result = await communityComponent.getCommunities(userAddress, options)

        expect(result.communities[0].thumbnails).toEqual({
          raw: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
        })
      })
    })
  })

  describe('getCommunitiesPublicInformation', () => {
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
        isLive: false
      }
    ]

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunitiesPublicInformation.mockResolvedValue(mockCommunities)
        mockCommunitiesDB.getPublicCommunitiesCount.mockResolvedValue(1)
        mockStorage.exists.mockResolvedValue(false)
      })

      it('should return public communities with total count', async () => {
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
              isLive: false
            })
          ]),
          total: 1
        })

        expect(mockCommunitiesDB.getCommunitiesPublicInformation).toHaveBeenCalledWith(options)
        expect(mockCommunitiesDB.getPublicCommunitiesCount).toHaveBeenCalledWith({ search: 'test' })
      })

      it('should include thumbnails when they exist', async () => {
        mockStorage.exists.mockResolvedValueOnce(true)

        const result = await communityComponent.getCommunitiesPublicInformation(options)

        expect(result.communities[0].thumbnails).toEqual({
          raw: `${cdnUrl}/social/communities/${communityId}/raw-thumbnail.png`
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
        privacy: 'public',
        active: true,
        role: CommunityRole.Member,
        joinedAt: '2023-01-01T00:00:00Z'
      }
    ]

    describe('when all validations pass', () => {
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
  })

  describe('createCommunity', () => {
    const ownerAddress = '0x1234567890123456789012345678901234567890'
    const communityData = {
      name: 'New Community',
      description: 'New Description',
      ownerAddress
    }
    const placeIds = ['place-1', 'place-2']
    const thumbnail = Buffer.from('fake-thumbnail')

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCatalystClient.getOwnedNames.mockResolvedValue([
          { id: '1', name: 'test-name', contractAddress: '0xcontract', tokenId: '1' }
        ])
        mockCommunityPlaces.validateOwnership.mockResolvedValue({
          isValid: true,
          ownedPlaces: placeIds,
          notOwnedPlaces: []
        })
        mockCommunitiesDB.createCommunity.mockResolvedValue({
          ...mockCommunity,
          ...communityData,
          id: 'new-community-id'
        })
        mockCommunitiesDB.addCommunityMember.mockResolvedValue()
        mockCommunityPlaces.addPlaces.mockResolvedValue()
        mockStorage.storeFile.mockResolvedValue('https://cdn.decentraland.org/thumbnail.png')
      })

      it('should create community successfully', async () => {
        const result = await communityComponent.createCommunity(communityData, thumbnail, placeIds)

        expect(result).toEqual({
          ...mockCommunity,
          ...communityData,
          id: 'new-community-id',
          thumbnails: {
            raw: 'https://cdn.decentraland.org/thumbnail.png'
          }
        })

        expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
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
        expect(mockStorage.storeFile).toHaveBeenCalledWith(thumbnail, `communities/new-community-id/raw-thumbnail.png`)
      })

      it('should create community without places and thumbnail', async () => {
        const result = await communityComponent.createCommunity(communityData)

        expect(result).toEqual({
          ...mockCommunity,
          ...communityData,
          id: 'new-community-id'
        })

        expect(mockCommunityPlaces.validateOwnership).not.toHaveBeenCalled()
        expect(mockCommunityPlaces.addPlaces).not.toHaveBeenCalled()
        expect(mockStorage.storeFile).not.toHaveBeenCalled()
      })
    })

    describe('when the user has no owned names', () => {
      beforeEach(() => {
        mockCatalystClient.getOwnedNames.mockResolvedValue([])
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityComponent.createCommunity(communityData)).rejects.toThrow(
          new NotAuthorizedError(`The user ${ownerAddress} doesn't have any names`)
        )

        expect(mockCatalystClient.getOwnedNames).toHaveBeenCalledWith(ownerAddress, { pageSize: '1' })
        expect(mockCommunitiesDB.createCommunity).not.toHaveBeenCalled()
      })
    })

    describe('when the user does not own all places', () => {
      beforeEach(() => {
        mockCatalystClient.getOwnedNames.mockResolvedValue([
          { id: '1', name: 'test-name', contractAddress: '0xcontract', tokenId: '1' }
        ])
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

  describe('deleteCommunity', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          role: CommunityRole.Owner
        })
        mockCommunitiesDB.deleteCommunity.mockResolvedValue()
      })

      it('should delete the community', async () => {
        await communityComponent.deleteCommunity(communityId, userAddress)

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.deleteCommunity).toHaveBeenCalledWith(communityId)
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityComponent.deleteCommunity(communityId, userAddress)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.deleteCommunity).not.toHaveBeenCalled()
      })
    })

    describe('when the user is not the owner', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          ownerAddress: '0xother-owner',
          role: CommunityRole.Member
        })
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

  describe('getCommunityPlaces', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    const options = { userAddress, pagination: { limit: 10, offset: 0 } }
    const mockPlaces = [{ id: 'place-1' }, { id: 'place-2' }]

    describe('when all validations pass for public community', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          privacy: 'public',
          role: CommunityRole.Member
        })
        mockCommunityPlaces.getPlaces.mockResolvedValue({
          places: mockPlaces,
          totalPlaces: 2
        })
      })

      it('should return community places', async () => {
        const result = await communityComponent.getCommunityPlaces(communityId, options)

        expect(result).toEqual({
          places: mockPlaces,
          totalPlaces: 2
        })

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunityPlaces.getPlaces).toHaveBeenCalledWith(communityId, options.pagination)
      })
    })

    describe('when all validations pass for private community with member access', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          privacy: 'private',
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
        mockCommunityPlaces.getPlaces.mockResolvedValue({
          places: mockPlaces,
          totalPlaces: 2
        })
      })

      it('should return community places', async () => {
        const result = await communityComponent.getCommunityPlaces(communityId, options)

        expect(result).toEqual({
          places: mockPlaces,
          totalPlaces: 2
        })

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunityPlaces.getPlaces).toHaveBeenCalledWith(communityId, options.pagination)
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityComponent.getCommunityPlaces(communityId, options)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).not.toHaveBeenCalled()
        expect(mockCommunityPlaces.getPlaces).not.toHaveBeenCalled()
      })
    })

    describe('when the community exists but getCommunity returns null', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityComponent.getCommunityPlaces(communityId, options)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.getCommunityMemberRole).not.toHaveBeenCalled()
        expect(mockCommunityPlaces.getPlaces).not.toHaveBeenCalled()
      })
    })

    describe('when the community is private and user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          privacy: 'private',
          role: CommunityRole.None
        })
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityComponent.getCommunityPlaces(communityId, options)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${userAddress} doesn't have permission to get places from community ${communityId}`
          )
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunityPlaces.getPlaces).not.toHaveBeenCalled()
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

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          role: CommunityRole.Owner
        })
        mockCommunityRoles.validatePermissionToEditCommunity.mockResolvedValue()
        mockCommunityPlaces.validateOwnership.mockResolvedValue({
          isValid: true,
          ownedPlaces: updates.placeIds,
          notOwnedPlaces: []
        })
        mockCommunitiesDB.updateCommunity.mockResolvedValue({
          ...mockCommunity,
          ...updates
        })
        mockStorage.storeFile.mockResolvedValue('https://cdn.decentraland.org/thumbnail.png')
        mockCommunityPlaces.updatePlaces.mockResolvedValue()
      })

      it('should update the community', async () => {
        const result = await communityComponent.updateCommunity(communityId, userAddress, updates)

        expect(result).toEqual({
          ...mockCommunity,
          ...updates,
          thumbnails: {
            raw: 'https://cdn.decentraland.org/thumbnail.png'
          }
        })

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(updates.placeIds, userAddress)
        expect(mockCommunitiesDB.updateCommunity).toHaveBeenCalledWith(communityId, updates)
        expect(mockStorage.storeFile).toHaveBeenCalledWith(
          updates.thumbnailBuffer,
          `communities/${communityId}/raw-thumbnail.png`
        )
        expect(mockCommunityPlaces.updatePlaces).toHaveBeenCalledWith(communityId, userAddress, updates.placeIds)
      })

      it('should return community without updates when no updates provided', async () => {
        const result = await communityComponent.updateCommunity(communityId, userAddress, {})

        expect(result).toEqual({
          id: mockCommunity.id,
          name: mockCommunity.name,
          description: mockCommunity.description,
          ownerAddress: mockCommunity.ownerAddress,
          privacy: mockCommunity.privacy,
          active: mockCommunity.active
        })

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunityRoles.validatePermissionToEditCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(null)
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

    describe('when the user does not have permission', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          role: CommunityRole.Member
        })
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

    describe('when the user does not own all places', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          ...mockCommunity,
          role: CommunityRole.Owner
        })
        mockCommunityRoles.validatePermissionToEditCommunity.mockResolvedValue()
        mockCommunityPlaces.validateOwnership.mockRejectedValue(
          new NotAuthorizedError(`The user ${userAddress} doesn't own all the places`)
        )
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityComponent.updateCommunity(communityId, userAddress, updates)).rejects.toThrow(
          new NotAuthorizedError(`The user ${userAddress} doesn't own all the places`)
        )

        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunityRoles.validatePermissionToEditCommunity).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunityPlaces.validateOwnership).toHaveBeenCalledWith(updates.placeIds, userAddress)
        expect(mockCommunitiesDB.updateCommunity).not.toHaveBeenCalled()
      })
    })
  })
})
