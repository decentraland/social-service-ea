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

describe('when handling community places operations', () => {
  let communityPlacesComponent: ICommunityPlacesComponent
  let mockCommunityRoles: ICommunityRolesComponent
  let mockPlacesApi: jest.Mocked<IPlacesApiComponent>
  let mockUserAddress: string
  const communityId = 'test-community'
  const mockPlaces: CommunityPlace[] = [
    {
      id: 'place-1',
      communityId,
      addedBy: mockUserAddress,
      addedAt: new Date()
    },
    {
      id: 'place-2',
      communityId,
      addedBy: mockUserAddress,
      addedAt: new Date()
    }
  ]

  beforeEach(async () => {
    mockUserAddress = '0x1234567890123456789012345678901234567890'
    mockCommunityRoles = createCommunityRolesComponent({ communitiesDb: mockCommunitiesDB, logs: mockLogs })
    mockPlacesApi = createPlacesApiAdapterMockComponent({}) as jest.Mocked<IPlacesApiComponent>
    communityPlacesComponent = await createCommunityPlacesComponent({
      communitiesDb: mockCommunitiesDB,
      communityRoles: mockCommunityRoles,
      logs: mockLogs,
      placesApi: mockPlacesApi
    })
  })

  describe('and getting community places', () => {
    beforeEach(() => {
      mockCommunitiesDB.getCommunityPlaces.mockResolvedValueOnce(mockPlaces.map((place) => ({ id: place.id })))
      mockCommunitiesDB.getCommunityPlacesCount.mockResolvedValueOnce(2)
    })

    it('should return places with total count', async () => {
      const result = await communityPlacesComponent.getPlaces(communityId, {
        limit: 10,
        offset: 0
      })

      expect(result).toEqual({
        places: mockPlaces.map((place) => ({ id: place.id })),
        totalPlaces: 2
      })
    })

    it('should fetch places and total count from the database', async () => {
      await communityPlacesComponent.getPlaces(communityId, {
        limit: 10,
        offset: 0
      })

      expect(mockCommunitiesDB.getCommunityPlaces).toHaveBeenCalledWith(communityId, {
        limit: 10,
        offset: 0
      })
      expect(mockCommunitiesDB.getCommunityPlacesCount).toHaveBeenCalledWith(communityId)
    })

    it('should handle pagination correctly', async () => {
      await communityPlacesComponent.getPlaces(communityId, {
        limit: 1,
        offset: 1
      })

      expect(mockCommunitiesDB.getCommunityPlaces).toHaveBeenCalledWith(communityId, {
        limit: 1,
        offset: 1
      })
    })
  })

  describe('and validating and adding places to a community', () => {
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
        mockCommunityRoles.validatePermissionToAddPlacesToCommunity = jest.fn().mockResolvedValueOnce(undefined)
        mockCommunitiesDB.addCommunityPlaces.mockResolvedValueOnce()
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

    describe('when community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
        mockCommunityRoles.validatePermissionToAddPlacesToCommunity = jest.fn()
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

    describe('when user does not have permission', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        const permissionError = new NotAuthorizedError(
          `The user ${mockUserAddress} doesn't have permission to add places to the community`
        )
        mockCommunityRoles.validatePermissionToAddPlacesToCommunity = jest.fn().mockRejectedValue(permissionError)
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

    describe('when user does not own all places', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToAddPlacesToCommunity = jest.fn().mockResolvedValueOnce(undefined)
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

  describe('and adding places directly (without validation)', () => {
    const placeIds = ['place-1', 'place-2']

    beforeEach(() => {
      mockCommunitiesDB.addCommunityPlaces.mockResolvedValueOnce()
    })

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

  describe('and removing a place from a community', () => {
    const placeId = 'place-1'

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.communityPlaceExists.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity = jest.fn().mockResolvedValueOnce(undefined)
        mockCommunitiesDB.removeCommunityPlace.mockResolvedValueOnce()
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

    describe('when community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
        mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity = jest.fn()
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

    describe('when place does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.communityPlaceExists.mockResolvedValueOnce(false)
        mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity = jest.fn()
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

    describe('when user does not have permission', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.communityPlaceExists.mockResolvedValueOnce(true)
        const permissionError = new NotAuthorizedError(
          `The user ${mockUserAddress} doesn't have permission to remove places from the community`
        )
        mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity = jest.fn().mockRejectedValue(permissionError)
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

  describe('and updating places in a community', () => {
    const placeIds = ['place-1', 'place-2']

    describe('when all validations pass', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunityRoles.validatePermissionToUpdatePlaces = jest.fn().mockResolvedValueOnce(undefined)
        mockCommunitiesDB.removeCommunityPlacesWithExceptions.mockResolvedValueOnce()
        mockCommunitiesDB.addCommunityPlaces.mockResolvedValueOnce()
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

    describe('when community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
        mockCommunityRoles.validatePermissionToUpdatePlaces = jest.fn()
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

    describe('when user does not have permission', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        const permissionError = new NotAuthorizedError(
          `The user ${mockUserAddress} doesn't have permission to update places in the community`
        )
        mockCommunityRoles.validatePermissionToUpdatePlaces = jest.fn().mockRejectedValue(permissionError)
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

  describe('and validating ownership of places', () => {
    const placeIds = ['place-1', 'place-2']

    describe('when user owns all places', () => {
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
    })

    describe('when user does not own all places', () => {
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

    describe('when placeIds array is empty', () => {
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
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValueOnce(undefined)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )
      })
    })
  })
})
