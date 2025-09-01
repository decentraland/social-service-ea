import { CommunityRole } from '../../../src/types/entities'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError, CommunityPlaceNotFoundError } from '../../../src/logic/community/errors'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { createPlacesApiAdapterMockComponent, createLogsMockedComponent } from '../../mocks/components'
import { createCommunityPlacesComponent } from '../../../src/logic/community/places'
import { ICommunityPlacesComponent, CommunityPlace, ICommunityRolesComponent, CommunityPrivacyEnum } from '../../../src/logic/community'
import { IPlacesApiComponent } from '../../../src/types/components'
import { createMockCommunityRolesComponent } from '../../mocks/communities'
import { ILoggerComponent } from '@well-known-components/interfaces/dist/components/logger'

describe('Community Places Component', () => {
  let defaultWorldData: { world: boolean; world_name: string }
  let communityPlacesComponent: ICommunityPlacesComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
  let mockPlacesApi: jest.Mocked<IPlacesApiComponent>
  let mockLogs: jest.Mocked<ILoggerComponent>
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
    
    mockLogs = createLogsMockedComponent({})
    
    communityPlacesComponent = await createCommunityPlacesComponent({
      communitiesDb: mockCommunitiesDB,
      communityRoles: mockCommunityRoles,
      logs: mockLogs,
      placesApi: mockPlacesApi
    })
  })

  describe('when getting places from a community', () => {
    let userAddress: string
    let options: any
    let mockPlaces: any[]
    let community: any

    beforeEach(() => {
      userAddress = '0x1234567890123456789012345678901234567890'
      options = { userAddress, pagination: { limit: 10, offset: 0 } }
      mockPlaces = [{ id: 'place-1' }, { id: 'place-2' }]
      community = null
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunitiesDB.getCommunity.mockResolvedValue(community)
      mockCommunitiesDB.getCommunityPlaces.mockResolvedValue(mockPlaces)
      mockCommunitiesDB.getCommunityPlacesCount.mockResolvedValue(2)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
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
          mockCommunitiesDB.getCommunity.mockResolvedValueOnce(community)
        })

        it('should return the community places with total count', async () => {
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
            mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Member)
          })

          it('should return the community places after validating member access', async () => {
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
            mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.None)
          })

          it('should throw NotAuthorizedError with permission denied message', async () => {
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
        let publicOptions: any

        beforeEach(() => {
          publicOptions = { pagination: { limit: 10, offset: 0 } }
          community = {
            id: communityId,
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0xowner',
            privacy: CommunityPrivacyEnum.Public,
            active: true,
            role: CommunityRole.Member
          }
          mockCommunitiesDB.getCommunity.mockResolvedValueOnce(community)
        })

        it('should return community places without authentication for public community', async () => {
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
          mockCommunitiesDB.getCommunity.mockResolvedValueOnce(community)
          mockCommunitiesDB.getCommunityPlaces.mockResolvedValueOnce([{ id: 'place-1' }])
          mockCommunitiesDB.getCommunityPlacesCount.mockResolvedValueOnce(1)
        })

        it('should apply the pagination parameters to the database query', async () => {
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
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError with the community ID', async () => {
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
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(null)
      })

      it('should throw CommunityNotFoundError despite exists check passing', async () => {
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
    let placeIds: string[]

    beforeEach(() => {
      placeIds = ['place-1', 'place-2']
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

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
      })

      describe('and the user has permission', () => {
        beforeEach(() => {
          mockCommunityRoles.validatePermissionToAddPlacesToCommunity.mockResolvedValueOnce()
        })

        describe('and the user owns all places', () => {
          beforeEach(() => {
            mockPlacesApi.getPlaces.mockResolvedValueOnce(
              mockPlaces.map((place) => ({
                id: place.id,
                title: place.id,
                positions: [],
                owner: mockUserAddress,
                ...defaultWorldData
              }))
            )
          })

          it('should validate permissions and ownership before adding places to the community', async () => {
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

          describe('and there are duplicate place IDs', () => {
            let duplicatePlaceIds: string[]
            let uniquePlaceIds: string[]

            beforeEach(() => {
              duplicatePlaceIds = ['place-1', 'place-1', 'place-2']
              uniquePlaceIds = ['place-1', 'place-2']
            })

            it('should deduplicate the place IDs before processing', async () => {
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
        })

        describe('and the user does not own all places', () => {
          beforeEach(() => {
            mockPlacesApi.getPlaces.mockResolvedValueOnce([
              { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress, ...defaultWorldData },
              { id: 'place-2', title: 'Place 2', positions: [], owner: '0xother-owner', ...defaultWorldData }
            ])
          })

          it('should throw NotAuthorizedError with ownership validation message', async () => {
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
          mockCommunityRoles.validatePermissionToAddPlacesToCommunity.mockRejectedValueOnce(permissionError)
        })

        it('should throw NotAuthorizedError with permission denied message', async () => {
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
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError before any validation', async () => {
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
    let placeIds: string[]

    beforeEach(() => {
      placeIds = ['place-1', 'place-2']
      mockCommunitiesDB.addCommunityPlaces.mockResolvedValue()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should add places to the community without any validation checks', async () => {
      await communityPlacesComponent.addPlaces(communityId, mockUserAddress, placeIds)

      expect(mockCommunitiesDB.addCommunityPlaces).toHaveBeenCalledWith(
        placeIds.map((id) => ({
          id,
          communityId,
          addedBy: mockUserAddress
        }))
      )
    })

    describe('and there are duplicate place IDs', () => {
      let duplicatePlaceIds: string[]
      let uniquePlaceIds: string[]

      beforeEach(() => {
        duplicatePlaceIds = ['place-1', 'place-1', 'place-2']
        uniquePlaceIds = ['place-1', 'place-2']
      })

      it('should deduplicate the place IDs before adding to database', async () => {
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
  })

  describe('when removing a place from a community', () => {
    let placeId: string
    let placeExists: boolean

    beforeEach(() => {
      placeId = 'place-1'
      placeExists = false
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunitiesDB.communityPlaceExists.mockResolvedValue(placeExists)
      mockCommunitiesDB.getCommunityMemberRole.mockResolvedValue(CommunityRole.Member)
      mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity.mockResolvedValue()
      mockCommunitiesDB.removeCommunityPlace.mockResolvedValue()
      // Mock place ownership validation
      mockPlacesApi.getPlaces.mockResolvedValue([
        {
          id: placeId,
          owner: mockUserAddress,
          title: 'Test Place',
          positions: [],
          ...defaultWorldData
        }
      ])
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
      })

      describe('and the place exists', () => {
              beforeEach(() => {
        placeExists = true
        mockCommunitiesDB.communityPlaceExists.mockResolvedValueOnce(placeExists)
      })

      describe('and the user is the community owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Owner)
        })

        it('should remove the place bypassing permission validation for community owners', async () => {
          await communityPlacesComponent.removePlace(communityId, mockUserAddress, placeId)

          expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
          expect(mockCommunitiesDB.communityPlaceExists).toHaveBeenCalledWith(communityId, placeId)
          expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, mockUserAddress)
          expect(mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity).not.toHaveBeenCalled()
          expect(mockCommunitiesDB.removeCommunityPlace).toHaveBeenCalledWith(communityId, placeId)
        })
      })

      describe('and the user is not the community owner', () => {
        beforeEach(() => {
          mockCommunitiesDB.getCommunityMemberRole.mockResolvedValueOnce(CommunityRole.Moderator)
        })

        it('should validate permissions before removing the place for non-owners', async () => {
          await communityPlacesComponent.removePlace(communityId, mockUserAddress, placeId)

          expect(mockCommunitiesDB.communityExists).toHaveBeenCalledWith(communityId)
          expect(mockCommunitiesDB.communityPlaceExists).toHaveBeenCalledWith(communityId, placeId)
          expect(mockCommunitiesDB.getCommunityMemberRole).toHaveBeenCalledWith(communityId, mockUserAddress)
          expect(mockCommunityRoles.validatePermissionToRemovePlacesFromCommunity).toHaveBeenCalledWith(
            communityId,
            mockUserAddress
          )
          expect(mockCommunitiesDB.removeCommunityPlace).toHaveBeenCalledWith(communityId, placeId)
        })
      })
      })

      describe('and the place does not exist', () => {
        beforeEach(() => {
          placeExists = false
          mockCommunitiesDB.communityPlaceExists.mockResolvedValueOnce(placeExists)
        })

        it('should throw CommunityPlaceNotFoundError with place and community identifiers', async () => {
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
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError before checking place existence', async () => {
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
    let placeIds: string[]

    beforeEach(() => {
      placeIds = ['place-1', 'place-2']
      mockCommunitiesDB.communityExists.mockResolvedValue(false)
      mockCommunityRoles.validatePermissionToUpdatePlaces.mockResolvedValue()
      mockCommunitiesDB.removeCommunityPlacesWithExceptions.mockResolvedValue()
      mockCommunitiesDB.addCommunityPlaces.mockResolvedValue()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the community exists', () => {
      beforeEach(() => {
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(true)
      })

      it('should validate permissions and replace all community places with the new set', async () => {
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
        mockCommunitiesDB.communityExists.mockResolvedValueOnce(false)
      })

      it('should throw CommunityNotFoundError before validating permissions', async () => {
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
    let placeIds: string[]

    beforeEach(() => {
      placeIds = ['place-1', 'place-2']
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

    afterEach(() => {
      jest.resetAllMocks()
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

      it('should return valid result with all places in owned list', async () => {
        const result = await communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)

        expect(result.isValid).toBe(true)
        expect(result.ownedPlaces).toEqual(placeIds)
        expect(result.notOwnedPlaces).toEqual([])
        expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith(placeIds)
      })

      describe('and owner addresses have different casing', () => {
        let upperCaseUserAddress: string

        beforeEach(() => {
          upperCaseUserAddress = mockUserAddress.toUpperCase()
          mockPlacesApi.getPlaces.mockResolvedValueOnce([
            { id: 'place-1', title: 'Place 1', positions: [], owner: upperCaseUserAddress, ...defaultWorldData },
            { id: 'place-2', title: 'Place 2', positions: [], owner: upperCaseUserAddress, ...defaultWorldData }
          ])
        })

        it('should handle case-insensitive owner address comparison', async () => {
          const result = await communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)

          expect(result.isValid).toBe(true)
          expect(result.ownedPlaces).toEqual(placeIds)
          expect(result.notOwnedPlaces).toEqual([])
        })
      })

      describe('and there are duplicate place IDs', () => {
        let duplicatePlaceIds: string[]
        let uniquePlaceIds: string[]

        beforeEach(() => {
          duplicatePlaceIds = ['place-1', 'place-1', 'place-2']
          uniquePlaceIds = ['place-1', 'place-2']
          mockPlacesApi.getPlaces.mockResolvedValueOnce([
            { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress, ...defaultWorldData },
            { id: 'place-2', title: 'Place 2', positions: [], owner: mockUserAddress, ...defaultWorldData }
          ])
        })

        it('should deduplicate place IDs and validate ownership correctly', async () => {
          const result = await communityPlacesComponent.validateOwnership(duplicatePlaceIds, mockUserAddress)

          expect(result.isValid).toBe(true)
          expect(result.ownedPlaces).toEqual(uniquePlaceIds)
          expect(result.notOwnedPlaces).toEqual([])
          expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith(uniquePlaceIds)
        })
      })
    })

    describe('and the user does not own all places', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValueOnce([
          { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress, ...defaultWorldData },
          { id: 'place-2', title: 'Place 2', positions: [], owner: '0xother-owner', ...defaultWorldData }
        ])
      })

      it('should throw NotAuthorizedError with ownership validation message', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )

        expect(mockPlacesApi.getPlaces).toHaveBeenCalledWith(placeIds)
      })
    })

    describe('and the placeIds array is empty', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValueOnce([])
      })

      it('should return valid result without calling API for empty array', async () => {
        const result = await communityPlacesComponent.validateOwnership([], mockUserAddress)

        expect(result.isValid).toBe(true)
        expect(result.ownedPlaces).toEqual([])
        expect(result.notOwnedPlaces).toEqual([])
        expect(mockPlacesApi.getPlaces).not.toHaveBeenCalled()
      })
    })

    describe('and places have no owner', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValueOnce([
          { id: 'place-1', title: 'Place 1', positions: [], owner: mockUserAddress, world: false, world_name: '' },
          { id: 'place-2', title: 'Place 2', positions: [], owner: null, world: false, world_name: '' }
        ])
      })

      it('should throw NotAuthorizedError for places with null owner', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )
      })
    })

    describe('and places API returns undefined', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValueOnce(undefined)
      })

      it('should throw NotAuthorizedError when API returns undefined', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )
      })
    })

    describe('and places API returns null', () => {
      beforeEach(() => {
        mockPlacesApi.getPlaces.mockResolvedValueOnce(null)
      })

      it('should throw NotAuthorizedError when API returns null', async () => {
        await expect(communityPlacesComponent.validateOwnership(placeIds, mockUserAddress)).rejects.toThrow(
          new NotAuthorizedError(`The user ${mockUserAddress} doesn't own all the places`)
        )
      })
    })
  })
})
