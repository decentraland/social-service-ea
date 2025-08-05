import { CommunityRole } from '../../../src/types/entities'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError, CommunityPlaceNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { mockLogs, createPlacesApiAdapterMockComponent } from '../../mocks/components'
import { createCommunityPlacesComponent } from '../../../src/logic/community/places'
import { ICommunityPlacesComponent, CommunityPlace, ICommunityRolesComponent, CommunityPrivacyEnum } from '../../../src/logic/community'
import { IPlacesApiComponent } from '../../../src/types/components'
import { createMockCommunityRolesComponent } from '../../mocks/communities'

describe('Community Places Component', () => {
  let defaultWorldData: { world: boolean; world_name: string }
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
    defaultWorldData = {
      world: false,
      world_name: ''
    }
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

  describe('when getting places from a community', () => {
    const userAddress = '0x1234567890123456789012345678901234567890'
    const options = { userAddress, pagination: { limit: 10, offset: 0 } }
    const mockPlaces = [{ id: 'place-1' }, { id: 'place-2' }]
    let community: any

    beforeEach(() => {
      community = null
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunitiesDB.getCommunity.mockResolvedValue(community)
      mockCommunitiesDB.getCommunityPlaces.mockResolvedValue(mockPlaces)
      mockCommunitiesDB.getCommunityPlacesCount.mockResolvedValue(2)
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
      })

      describe('and the community is public', () => {
        beforeEach(() => {
          community = {
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0xowner',
            privacy: CommunityPrivacyEnum.Public,
            active: true,
            role: CommunityRole.Member
          }
          mockCommunitiesDB.getCommunity.mockResolvedValue(community)
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

      describe('and the community is private', () => {
        beforeEach(() => {
          community = {
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0xowner',
            privacy: CommunityPrivacyEnum.Private,
            active: true,
            role: CommunityRole.Member
          }
          mockCommunitiesDB.getCommunity.mockResolvedValue(community)
        })

        describe('and the user is a member', () => {
          beforeEach(() => {
            mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
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

        describe('and the user is not a member', () => {
          beforeEach(() => {
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
      })

      describe('and called without user address (public access)', () => {
        const publicOptions = { pagination: { limit: 10, offset: 0 } }

        beforeEach(() => {
          community = {
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0xowner',
            privacy: CommunityPrivacyEnum.Public,
            active: true,
            role: CommunityRole.Member
          }
          mockCommunitiesDB.getCommunity.mockResolvedValue(community)
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

      describe('and called with pagination parameters', () => {
        beforeEach(() => {
          community = {
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0xowner',
            privacy: CommunityPrivacyEnum.Public,
            active: true,
            role: CommunityRole.Member
          }
          mockCommunitiesDB.getCommunity.mockResolvedValue(community)
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

    describe('and the community does not exist', () => {
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

    describe('and the community exists but getCommunity returns null', () => {
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
  })

  describe('when validating and adding places to a community', () => {
    const placeIds = ['place-1', 'place-2']

    beforeEach(() => {
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockPlacesApi.getPlaces.mockResolvedValue(
        mockPlaces.map((place) => ({
          id: place.id,
          title: place.id,
          positions: [],
          owner: mockUserAddress,
          ...defaultWorldData
        }))
      )
      mockCommunityRoles.validatePermissionToAddPlacesToCommunity.mockResolvedValue()
      mockCommunitiesDB.addCommunityPlaces.mockResolvedValue()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
      })

      describe('and the user has permission', () => {
        beforeEach(() => {
          mockCommunityRoles.validatePermissionToAddPlacesToCommunity.mockResolvedValue()
        })

        describe('and the user owns all places', () => {
          beforeEach(() => {
            mockPlacesApi.getPlaces.mockResolvedValue(
              mockPlaces.map((place) => ({
                id: place.id,
                title: place.id,
                positions: [],
                owner: mockUserAddress,
                ...defaultWorldData
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

        describe('and the user does not own all places', () => {
          beforeEach(() => {
            mockPlacesApi.getPlaces.mockResolvedValue([
              { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress, ...defaultWorldData },
              { id: 'place-2', title: 'Place 2', positions: [], owner: '0xother-owner', ...defaultWorldData }
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

      describe('and the user does not have permission', () => {
        beforeEach(() => {
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
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
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
  })

  describe('when adding places to a community', () => {
    const placeIds = ['place-1', 'place-2']

    beforeEach(() => {
      mockCommunitiesDB.addCommunityPlaces.mockResolvedValue()
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

  describe('when removing a place from a community', () => {
    const placeId = 'place-1'
    let placeExists: boolean

    beforeEach(() => {
      placeExists = false
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunitiesDB.communityPlaceExists.mockResolvedValue(placeExists)
      mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity.mockResolvedValue()
      mockCommunitiesDB.removeCommunityPlace.mockResolvedValue()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
      })

      describe('and the place exists', () => {
        beforeEach(() => {
          placeExists = true
          mockCommunitiesDB.communityPlaceExists.mockResolvedValue(placeExists)
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

      describe('and the place does not exist', () => {
        beforeEach(() => {
          placeExists = false
          mockCommunitiesDB.communityPlaceExists.mockResolvedValue(placeExists)
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
    })

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
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
  })

  describe('when updating places in a community', () => {
    const placeIds = ['place-1', 'place-2']

    beforeEach(() => {
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunityRoles.validatePermissionToUpdatePlaces.mockResolvedValue()
      mockCommunitiesDB.removeCommunityPlacesWithExceptions.mockResolvedValue()
      mockCommunitiesDB.addCommunityPlaces.mockResolvedValue()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(true)
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

    describe('and the community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValue(false)
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
  })

  describe('when validating place ownership', () => {
    const placeIds = ['place-1', 'place-2']

    beforeEach(() => {
      mockPlacesApi.getPlaces.mockResolvedValue(
        mockPlaces.map((place) => ({
          id: place.id,
          title: place.id,
          positions: [],
          owner: mockUserAddress,
          ...defaultWorldData
        }))
      )
    })

    describe('and the user owns all places', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValue(
          mockPlaces.map((place) => ({
            id: place.id,
            title: place.id,
            positions: [],
            owner: mockUserAddress,
            ...defaultWorldData
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
        mockPlacesApi.getPlaces.mockResolvedValue([
          { id: 'place-1', title: 'Place 1', positions: [], owner: upperCaseUserAddress, ...defaultWorldData },
          { id: 'place-2', title: 'Place 2', positions: [], owner: upperCaseUserAddress, ...defaultWorldData }
        ])

        const result = await communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)

        expect(result.isValid).toBe(true)
        expect(result.ownedPlaces).toEqual(placeIds)
        expect(result.notOwnedPlaces).toEqual([])
      })

      it('should handle duplicate place IDs by deduplicating them', async () => {
        const duplicatePlaceIds = ['place-1', 'place-1', 'place-2']
        const uniquePlaceIds = ['place-1', 'place-2']

        mockPlacesApi.getPlaces.mockResolvedValue([
          { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress, ...defaultWorldData },
          { id: 'place-2', title: 'Place 2', positions: [], owner: mockUserAddress, ...defaultWorldData }
        ])

        const result = await communityPlacesComponent.validateOwnership(duplicatePlaceIds, mockUserAddress)

        expect(result.isValid).toBe(true)
        expect(result.ownedPlaces).toEqual(uniquePlaceIds)
        expect(result.notOwnedPlaces).toEqual([])
        expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith(uniquePlaceIds)
      })
    })

    describe('and the user does not own all places', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValue([
          { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress, ...defaultWorldData },
          { id: 'place-2', title: 'Place 2', positions: [], owner: '0xother-owner', ...defaultWorldData }
        ])
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )

        expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith(placeIds)
      })
    })

    describe('and the placeIds array is empty', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValue([])
      })

      it('should handle empty placeIds array', async () => {
        const result = await communityPlacesComponent.validateOwnership([], mockUserAddress)

        expect(result.isValid).toBe(true)
        expect(result.ownedPlaces).toEqual([])
        expect(result.notOwnedPlaces).toEqual([])
        expect(mockPlacesApi.getPlaces).not.toHaveBeenCalled()
      })
    })

    describe('and places have no owner', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValue([
          { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress, world: false, world_name: '' },
          { id: 'place-2', title: 'Place 2', positions: [], owner: null, world: false, world_name: '' }
        ])
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )
      })
    })

    describe('and places API returns undefined', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValue(undefined)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )
      })
    })

    describe('and places API returns null', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValue(null)
      })

      it('should throw NotAuthorizedError', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )
      })
    })
  })
})
