import { CommunityRole } from '../../../src/types/entities'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError, CommunityPlaceNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs, createPlacesApiAdapterMockComponent } from '../../mocks/components'
import { createCommunityPlacesComponent } from '../../../src/logic/community/places'
import {
  ICommunityPlacesComponent,
  CommunityPlace,
  ICommunityRolesComponent,
  createCommunityRolesComponent
} from '../../../src/logic/community'
import { IPlacesApiComponent } from '../../../src/types/components'
import { createMockCommunityPlacesComponent, createMockCommunityRolesComponent } from '../../mocks/community'

describe('Community Places Component', () => {
  let communityPlacesComponent: ICommunityPlacesComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
  let mockPlacesApi: jest.Mocked<IPlacesApiComponent>
  let mockUserAddress: string
  const communityId = 'test-community'
  const mockPlaces: CommunityPlace[] = [
    {
      id: 'place-1',
      communityId,
      addedBy: '0x1234567890123456789012345678901234567890',
      addedAt: new Date()
    },
    {
      id: 'place-2',
      communityId,
      addedBy: '0x1234567890123456789012345678901234567890',
      addedAt: new Date()
    }
  ]

  beforeEach(async () => {
    mockUserAddress = '0x1234567890123456789012345678901234567890'
    mockCommunityRoles = createMockCommunityRolesComponent({})
    mockPlacesApi = createPlacesApiAdapterMockComponent({}) as jest.Mocked<IPlacesApiComponent>
    communityPlacesComponent = await createCommunityPlacesComponent({
      communitiesDb: mockCommunitiesDB,
      communityRoles: mockCommunityRoles,
      logs: mockLogs,
      placesApi: mockPlacesApi
    })
  })

  describe('getPlaces', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    const options = { userAddress, pagination: { limit: 10, offset: 0 } }
    const mockPlaces = [{ id: 'place-1' }, { id: 'place-2' }]

    describe('when all validations pass for public community', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: 'public',
          active: true,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityPlaces.mockResolvedValue(mockPlaces)
        mockCommunitiesDB.getCommunityPlacesCount.mockResolvedValue(2)
      })

      it('should return community places', async () => {
        const result = await communityPlacesComponent.getPlaces(communityId, options)

        expect(result).toEqual({
          places: mockPlaces,
          totalPlaces: 2
        })

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.getCommunityPlaces).toHaveBeenCalledWith(communityId, options.pagination)
        expect(mockCommunitiesDB.getCommunityPlacesCount).toHaveBeenCalledWith(communityId)
      })
    })

    describe('when all validations pass for private community with member access', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: 'private',
          active: true,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
        mockCommunitiesDB.getCommunityPlaces.mockResolvedValue(mockPlaces)
        mockCommunitiesDB.getCommunityPlacesCount.mockResolvedValue(2)
      })

      it('should return community places', async () => {
        const result = await communityPlacesComponent.getPlaces(communityId, options)

        expect(result).toEqual({
          places: mockPlaces,
          totalPlaces: 2
        })

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.getCommunityPlaces).toHaveBeenCalledWith(communityId, options.pagination)
        expect(mockCommunitiesDB.getCommunityPlacesCount).toHaveBeenCalledWith(communityId)
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityPlacesComponent.getPlaces(communityId, options)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getCommunityPlaces).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getCommunityPlacesCount).not.toHaveBeenCalled()
      })
    })

    describe('when the community exists but getCommunity returns null', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunity.mockResolvedValue(null)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityPlacesComponent.getPlaces(communityId, options)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.getCommunityMemberRole).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getCommunityPlaces).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getCommunityPlacesCount).not.toHaveBeenCalled()
      })
    })

    describe('when the community is private and user is not a member', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: 'private',
          active: true,
          role: CommunityRole.None
        })
        mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.None)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.getPlaces(communityId, options)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${userAddress} doesn't have permission to get places from community ${communityId}`
          )
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: false })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, userAddress)
        expect(mockCommunitiesDB.getCommunityPlaces).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.getCommunityPlacesCount).not.toHaveBeenCalled()
      })
    })

    describe('when called without user address (public access)', () => {
      const publicOptions = { pagination: { limit: 10, offset: 0 } }

      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: 'public',
          active: true,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityPlaces.mockResolvedValue(mockPlaces)
        mockCommunitiesDB.getCommunityPlacesCount.mockResolvedValue(2)
      })

      it('should return community places for public community', async () => {
        const result = await communityPlacesComponent.getPlaces(communityId, publicOptions)

        expect(result).toEqual({
          places: mockPlaces,
          totalPlaces: 2
        })

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId, { onlyPublic: true })
        expect(mockCommunitiesDB.getCommunity).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.getCommunityPlaces).toHaveBeenCalledWith(communityId, publicOptions.pagination)
        expect(mockCommunitiesDB.getCommunityPlacesCount).toHaveBeenCalledWith(communityId)
      })
    })

    describe('when called with pagination parameters', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
        mockCommunitiesDB.getCommunity.mockResolvedValue({
          id: communityId,
          name: 'Test Community',
          description: 'Test Description',
          ownerAddress: '0xowner',
          privacy: 'public',
          active: true,
          role: CommunityRole.Member
        })
        mockCommunitiesDB.getCommunityPlaces.mockResolvedValue([{ id: 'place-1' }])
        mockCommunitiesDB.getCommunityPlacesCount.mockResolvedValue(1)
      })

      it('should handle pagination correctly', async () => {
        const paginationOptions = { userAddress, pagination: { limit: 1, offset: 1 } }

        await communityPlacesComponent.getPlaces(communityId, paginationOptions)

        expect(mockCommunitiesDB.getCommunityPlaces).toHaveBeenCalledWith(communityId, {
          limit: 1,
          offset: 1
        })
        expect(mockCommunitiesDB.getCommunityPlacesCount).toHaveBeenCalledWith(communityId)
      })
    })
  })

  describe('validateAndAddPlaces', () => {
    const placeIds = ['place-1', 'place-2']

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockPlacesApi.getPlaces.mockResolvedValueOnce(
          mockPlaces.map((place) => ({
            id: place.id,
            title: place.id,
            positions: [],
            owner: mockUserAddress
          }))
        )
      })

      it('should validate and add places to the community successfully', async () => {
        await communityPlacesComponent.validateAndAddPlaces(communityId, mockUserAddress, placeIds)

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToAddPlacesToCommunity).toHaveBeenCalledWith(
          communityId,
          mockUserAddress
        )
        expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith(placeIds)
        expect(mockCommunitiesDB.addCommunityPlaces).toHaveBeenCalledWith(
          placeIds.map((id) => ({
            id,
            communityId,
            addedBy: mockUserAddress
          }))
        )
      })

      it('should handle duplicate place IDs by deduplicating them', async () => {
        const duplicatePlaceIds = ['place-1', 'place-1', 'place-2']
        const uniquePlaceIds = ['place-1', 'place-2']

        await communityPlacesComponent.validateAndAddPlaces(communityId, mockUserAddress, duplicatePlaceIds)

        expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith(uniquePlaceIds)
        expect(mockCommunitiesDB.addCommunityPlaces).toHaveBeenCalledWith(
          uniquePlaceIds.map((id) => ({
            id,
            communityId,
            addedBy: mockUserAddress
          }))
        )
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(
          communityPlacesComponent.validateAndAddPlaces(communityId, mockUserAddress, placeIds)
        ).rejects.toThrow(new CommunityNotFoundError(communityId))

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToAddPlacesToCommunity).not.toHaveBeenCalled()
        expect(mockPlacesApi.getPlaces).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.addCommunityPlaces).not.toHaveBeenCalled()
      })
    })

    describe('when the user does not have permission', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        const permissionError = new NotAuthorizedError(
          `The user ${mockUserAddress} doesn't have permission to add places to the community`
        )
        mockCommunityRoles.validatePermissionToAddPlacesToCommunity.mockRejectedValue(permissionError)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(
          communityPlacesComponent.validateAndAddPlaces(communityId, mockUserAddress, placeIds)
        ).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't have permission to add places to the community`)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToAddPlacesToCommunity).toHaveBeenCalledWith(
          communityId,
          mockUserAddress
        )
        expect(mockPlacesApi.getPlaces).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.addCommunityPlaces).not.toHaveBeenCalled()
      })
    })

    describe('when the user does not own all places', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockPlacesApi.getPlaces.mockResolvedValueOnce([
          { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress },
          { id: 'place-2', title: 'Place 2', positions: [], owner: '0xother-owner' }
        ])
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(
          communityPlacesComponent.validateAndAddPlaces(communityId, mockUserAddress, placeIds)
        ).rejects.toThrow(new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`))

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToAddPlacesToCommunity).toHaveBeenCalledWith(
          communityId,
          mockUserAddress
        )
        expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith(placeIds)
        expect(mockCommunitiesDB.addCommunityPlaces).not.toHaveBeenCalled()
      })
    })
  })

  describe('addPlaces', () => {
    const placeIds = ['place-1', 'place-2']

    beforeEach(() => {})

    it('should add places to the community without validation', async () => {
      await communityPlacesComponent.addPlaces(communityId, mockUserAddress, placeIds)

      expect(mockCommunitiesDB.addCommunityPlaces).toHaveBeenCalledWith(
        placeIds.map((id) => ({
          id,
          communityId,
          addedBy: mockUserAddress
        }))
      )
    })

    it('should handle duplicate place IDs by deduplicating them', async () => {
      const duplicatePlaceIds = ['place-1', 'place-1', 'place-2']
      const uniquePlaceIds = ['place-1', 'place-2']

      await communityPlacesComponent.addPlaces(communityId, mockUserAddress, duplicatePlaceIds)

      expect(mockCommunitiesDB.addCommunityPlaces).toHaveBeenCalledWith(
        uniquePlaceIds.map((id) => ({
          id,
          communityId,
          addedBy: mockUserAddress
        }))
      )
    })
  })

  describe('removePlace', () => {
    const placeId = 'place-1'

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.communityPlaceExists.mockResolvedValueOnce(true)
      })

      it('should validate and remove the place from the community', async () => {
        await communityPlacesComponent.removePlace(communityId, mockUserAddress, placeId)

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.communityPlaceExists).toHaveBeenCalledWith(communityId, placeId)
        expect(mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity).toHaveBeenCalledWith(
          communityId,
          mockUserAddress
        )
        expect(mockCommunitiesDB.removeCommunityPlace).toHaveBeenCalledWith(communityId, placeId)
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityPlacesComponent.removePlace(communityId, mockUserAddress, placeId)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.communityPlaceExists).not.toHaveBeenCalled()
        expect(mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.removeCommunityPlace).not.toHaveBeenCalled()
      })
    })

    describe('when the place does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.communityPlaceExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityPlaceNotFoundError', async () => {
        await expect(communityPlacesComponent.removePlace(communityId, mockUserAddress, placeId)).rejects.toThrow(
          new CommunityPlaceNotFoundError(`Place ${placeId} not found in community ${communityId}`)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.communityPlaceExists).toHaveBeenCalledWith(communityId, placeId)
        expect(mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.removeCommunityPlace).not.toHaveBeenCalled()
      })
    })

    describe('when the user does not have permission', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.communityPlaceExists.mockResolvedValueOnce(true)
        const permissionError = new NotAuthorizedError(
          `The user ${mockUserAddress} doesn't have permission to remove places from the community`
        )
        mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity.mockRejectedValue(permissionError)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.removePlace(communityId, mockUserAddress, placeId)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${mockUserAddress} doesn't have permission to remove places from the community`
          )
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunitiesDB.communityPlaceExists).toHaveBeenCalledWith(communityId, placeId)
        expect(mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity).toHaveBeenCalledWith(
          communityId,
          mockUserAddress
        )
        expect(mockCommunitiesDB.removeCommunityPlace).not.toHaveBeenCalled()
      })
    })
  })

  describe('updatePlaces', () => {
    const placeIds = ['place-1', 'place-2']

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
      })

      it('should validate and update places in the community', async () => {
        await communityPlacesComponent.updatePlaces(communityId, mockUserAddress, placeIds)

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToUpdatePlaces).toHaveBeenCalledWith(communityId, mockUserAddress)
        expect(mockCommunitiesDB.removeCommunityPlacesWithExceptions).toHaveBeenCalledWith(communityId, placeIds)
        expect(mockCommunitiesDB.addCommunityPlaces).toHaveBeenCalledWith(
          placeIds.map((id) => ({
            id,
            communityId,
            addedBy: mockUserAddress.toLowerCase()
          }))
        )
      })
    })

    describe('when the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError', async () => {
        await expect(communityPlacesComponent.updatePlaces(communityId, mockUserAddress, placeIds)).rejects.toThrow(
          new CommunityNotFoundError(communityId)
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToUpdatePlaces).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.removeCommunityPlacesWithExceptions).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.addCommunityPlaces).not.toHaveBeenCalled()
      })
    })

    describe('when the user does not have permission', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        const permissionError = new NotAuthorizedError(
          `The user ${mockUserAddress} doesn't have permission to update places in the community`
        )
        mockCommunityRoles.validatePermissionToUpdatePlaces.mockRejectedValue(permissionError)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.updatePlaces(communityId, mockUserAddress, placeIds)).rejects.toThrow(
          new NotAuthorizedError(
            `The user ${mockUserAddress} doesn't have permission to update places in the community`
          )
        )

        expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
        expect(mockCommunityRoles.validatePermissionToUpdatePlaces).toHaveBeenCalledWith(communityId, mockUserAddress)
        expect(mockCommunitiesDB.removeCommunityPlacesWithExceptions).not.toHaveBeenCalled()
        expect(mockCommunitiesDB.addCommunityPlaces).not.toHaveBeenCalled()
      })
    })
  })

  describe('validateOwnership', () => {
    const placeIds = ['place-1', 'place-2']

    describe('when the user owns all places', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValueOnce(
          mockPlaces.map((place) => ({
            id: place.id,
            title: place.id,
            positions: [],
            owner: mockUserAddress
          }))
        )
      })

      it('should validate ownership successfully', async () => {
        const result = await communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)

        expect(result.isValid).toBe(true)
        expect(result.ownedPlaces).toEqual(placeIds)
        expect(result.notOwnedPlaces).toEqual([])
        expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith(placeIds)
      })

      it('should handle case-insensitive owner comparison', async () => {
        const upperCaseUserAddress = mockUserAddress.toUpperCase()
        mockPlacesApi.getPlaces.mockResolvedValueOnce([
          { id: 'place-1', title: 'Place 1', positions: [], owner: upperCaseUserAddress },
          { id: 'place-2', title: 'Place 2', positions: [], owner: upperCaseUserAddress }
        ])

        const result = await communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)

        expect(result.isValid).toBe(true)
        expect(result.ownedPlaces).toEqual(placeIds)
        expect(result.notOwnedPlaces).toEqual([])
      })

      it('should handle duplicate place IDs by deduplicating them', async () => {
        const duplicatePlaceIds = ['place-1', 'place-1', 'place-2']
        const uniquePlaceIds = ['place-1', 'place-2']

        mockPlacesApi.getPlaces.mockResolvedValueOnce([
          { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress },
          { id: 'place-2', title: 'Place 2', positions: [], owner: mockUserAddress }
        ])

        const result = await communityPlacesComponent.validateOwnership(duplicatePlaceIds, mockUserAddress)

        expect(result.isValid).toBe(true)
        expect(result.ownedPlaces).toEqual(uniquePlaceIds)
        expect(result.notOwnedPlaces).toEqual([])
        expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith(uniquePlaceIds)
      })
    })

    describe('when the user does not own all places', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValueOnce([
          { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress },
          { id: 'place-2', title: 'Place 2', positions: [], owner: '0xother-owner' }
        ])
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )

        expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith(placeIds)
      })
    })

    describe('when the placeIds array is empty', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValueOnce([])
      })

      it('should handle empty placeIds array', async () => {
        const result = await communityPlacesComponent.validateOwnership([], mockUserAddress)

        expect(result.isValid).toBe(true)
        expect(result.ownedPlaces).toEqual([])
        expect(result.notOwnedPlaces).toEqual([])
        expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith([])
      })
    })

    describe('when places have no owner', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValueOnce([
          { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress },
          { id: 'place-2', title: 'Place 2', positions: [], owner: null }
        ])
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )
      })
    })

    describe('when places API returns undefined', () => {
      beforeEach(() => {})

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )
      })
    })

    describe('when places API returns null', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValueOnce(null)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )
      })
    })
  })
})
