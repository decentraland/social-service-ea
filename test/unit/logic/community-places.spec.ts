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
  let mockPlacesApi: IPlacesApiComponent
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
    mockPlacesApi = createPlacesApiAdapterMockComponent()
    communityPlacesComponent = await createCommunityPlacesComponent({
      communitiesDb: mockCommunitiesDB,
      communityRoles: mockCommunityRoles,
      logs: mockLogs,
      placesApi: mockPlacesApi
    })
  })

  describe('and getting community places', () => {
    beforeEach(() => {
      mockCommunitiesDB.getCommunityPlaces.mockResolvedValue(mockPlaces)
      mockCommunitiesDB.getCommunityPlacesCount.mockResolvedValue(2)
    })

    it('should return places with total count', async () => {
      const result = await communityPlacesComponent.getPlaces(communityId, {
        limit: 10,
        offset: 0
      })

      expect(result).toEqual({
        places: mockPlaces,
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

  describe('and adding owned places to a community', () => {
    const placeIds = ['place-1', 'place-2']

    beforeEach(() => {
      mockCommunitiesDB.communityExists.mockResolvedValue(true)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
      mockPlacesApi.getPlaces = jest.fn().mockResolvedValue(mockPlaces.map((place) => ({
        id: place.id,
        title: place.id,
        positions: [],
        owner: mockUserAddress
      })))
    })

    it('should add places to the community', async () => {
      await communityPlacesComponent.addPlaces(communityId, mockUserAddress, placeIds)

      expect(mockCommunitiesDB.addCommunityPlaces).toHaveBeenCalledWith(
        placeIds.map((id) => ({
          id,
          communityId,
          addedBy: mockUserAddress
        }))
      )
    })

    it('should throw CommunityNotFoundError when community does not exist', async () => {
      mockCommunitiesDB.communityExists.mockResolvedValue(false)

      await expect(communityPlacesComponent.addPlaces(communityId, mockUserAddress, placeIds)).rejects.toThrow(
        new CommunityNotFoundError(communityId)
      )
    })

    it('should throw NotAuthorizedError when user does not have permission', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)

      await expect(communityPlacesComponent.addPlaces(communityId, mockUserAddress, placeIds)).rejects.toThrow(
        new NotAuthorizedError(
          `The user ${mockUserAddress} doesn't have permission to add places to community ${communityId}`
        )
      )
    })
  })

  describe('and removing a place from a community', () => {
    const placeId = 'place-1'

    beforeEach(() => {
      mockCommunitiesDB.communityExists.mockResolvedValue(true)
      mockCommunitiesDB.communityPlaceExists.mockResolvedValue(true)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Owner)
    })

    it('should remove the place from the community', async () => {
      await communityPlacesComponent.removePlace(communityId, mockUserAddress, placeId)

      expect(mockCommunitiesDB.removeCommunityPlace).toHaveBeenCalledWith(communityId, placeId)
    })

    it('should throw CommunityNotFoundError when community does not exist', async () => {
      mockCommunitiesDB.communityExists.mockResolvedValue(false)

      await expect(communityPlacesComponent.removePlace(communityId, mockUserAddress, placeId)).rejects.toThrow(
        new CommunityNotFoundError(communityId)
      )
    })

    it('should throw CommunityPlaceNotFoundError when place does not exist', async () => {
      mockCommunitiesDB.communityPlaceExists.mockResolvedValue(false)

      await expect(communityPlacesComponent.removePlace(communityId, mockUserAddress, placeId)).rejects.toThrow(
        new CommunityPlaceNotFoundError(`Place ${placeId} not found in community ${communityId}`)
      )
    })

    it('should throw NotAuthorizedError when user does not have permission', async () => {
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)

      await expect(communityPlacesComponent.removePlace(communityId, mockUserAddress, placeId)).rejects.toThrow(
        new NotAuthorizedError(
          `The user ${mockUserAddress} doesn't have permission to remove places from community ${communityId}`
        )
      )
    })
  })
})
