import { createFriendsComponent } from '../../../src/logic/friends/component'
import { IFriendsComponent } from '../../../src/logic/friends/types'
import { createFriendsDBMockedComponent } from '../../mocks/components/friends-db'
import { mockCatalystClient } from '../../mocks/components/catalyst-client'
import { createMockProfile } from '../../mocks/profile'
import { Pagination } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

describe('Friends Component', () => {
  let friendsComponent: IFriendsComponent
  let mockFriendsDB: jest.Mocked<ReturnType<typeof createFriendsDBMockedComponent>>
  let mockUserAddress: string

  beforeEach(async () => {
    mockUserAddress = '0x1234567890123456789012345678901234567890'
    mockFriendsDB = createFriendsDBMockedComponent({})

    friendsComponent = await createFriendsComponent({
      friendsDb: mockFriendsDB,
      catalystClient: mockCatalystClient
    })
  })

  describe('when getting friends profiles', () => {
    const pagination: Pagination = { limit: 10, offset: 0 }

    describe('and the user has friends', () => {
      const mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]
      const mockProfiles = [
        createMockProfile('0xfriend1'),
        createMockProfile('0xfriend2'),
        createMockProfile('0xfriend3')
      ]

      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(3)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should return friends profiles with total count', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: mockProfiles,
          total: 3
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1', '0xfriend2', '0xfriend3'])
      })

      it('should handle pagination correctly', async () => {
        const customPagination: Pagination = { limit: 5, offset: 10 }

        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, customPagination)

        expect(result).toEqual({
          friendsProfiles: mockProfiles,
          total: 3
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination: customPagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
      })
    })

    describe('and the user has no friends', () => {
      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue([])
        mockFriendsDB.getFriendsCount.mockResolvedValue(0)
        mockCatalystClient.getProfiles.mockResolvedValue([])
      })

      it('should return empty profiles array with zero total', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: [],
          total: 0
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([])
      })
    })

    describe('and no pagination is provided', () => {
      const mockFriends = [{ address: '0xfriend1' }]
      const mockProfiles = [createMockProfile('0xfriend1')]

      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(1)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should work without pagination', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress)

        expect(result).toEqual({
          friendsProfiles: mockProfiles,
          total: 1
        })

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination: undefined,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1'])
      })
    })

    describe('and there are duplicate friend addresses', () => {
      const mockProfiles = [createMockProfile('0xfriend1'), createMockProfile('0xfriend2')]

      beforeEach(() => {
        const friendsWithDuplicates = [
          { address: '0xfriend1' },
          { address: '0xfriend1' }, // Duplicate
          { address: '0xfriend2' }
        ]
        mockFriendsDB.getFriends.mockResolvedValue(friendsWithDuplicates)
        mockFriendsDB.getFriendsCount.mockResolvedValue(3)
        mockCatalystClient.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should handle duplicate addresses correctly', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: mockProfiles,
          total: 3
        })

        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith([
          '0xfriend1',
          '0xfriend1', // Duplicate should be included as it comes from the database
          '0xfriend2'
        ])
      })
    })

    describe('and the database returns an error', () => {
      beforeEach(() => {
        mockFriendsDB.getFriends.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getFriendsProfiles(mockUserAddress, pagination)).rejects.toThrow(
          'Database connection failed'
        )

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe('and the catalyst client returns an error', () => {
      const mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]

      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(3)
        mockCatalystClient.getProfiles.mockRejectedValue(new Error('Catalyst service unavailable'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getFriendsProfiles(mockUserAddress, pagination)).rejects.toThrow(
          'Catalyst service unavailable'
        )

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1', '0xfriend2', '0xfriend3'])
      })
    })

    describe('and the friends count query returns an error', () => {
      const mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]

      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockRejectedValue(new Error('Count query failed'))
      })

      it('should propagate the error', async () => {
        await expect(friendsComponent.getFriendsProfiles(mockUserAddress, pagination)).rejects.toThrow(
          'Count query failed'
        )

        expect(mockFriendsDB.getFriends).toHaveBeenCalledWith(mockUserAddress, {
          pagination,
          onlyActive: true
        })
        expect(mockFriendsDB.getFriendsCount).toHaveBeenCalledWith(mockUserAddress, {
          onlyActive: true
        })
        expect(mockCatalystClient.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe('and the catalyst client returns fewer profiles than expected', () => {
      const mockFriends = [{ address: '0xfriend1' }, { address: '0xfriend2' }, { address: '0xfriend3' }]

      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(3)
        // Catalyst returns only 2 profiles instead of 3
        mockCatalystClient.getProfiles.mockResolvedValue([
          createMockProfile('0xfriend1'),
          createMockProfile('0xfriend2')
        ])
      })

      it('should return the profiles that were successfully retrieved', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: [createMockProfile('0xfriend1'), createMockProfile('0xfriend2')],
          total: 3
        })

        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1', '0xfriend2', '0xfriend3'])
      })
    })

    describe('and the catalyst client returns more profiles than expected', () => {
      const mockFriends = [{ address: '0xfriend1' }]

      beforeEach(() => {
        mockFriendsDB.getFriends.mockResolvedValue(mockFriends)
        mockFriendsDB.getFriendsCount.mockResolvedValue(1)
        // Catalyst returns 2 profiles instead of 1
        mockCatalystClient.getProfiles.mockResolvedValue([
          createMockProfile('0xfriend1'),
          createMockProfile('0xfriend2')
        ])
      })

      it('should return all profiles from catalyst', async () => {
        const result = await friendsComponent.getFriendsProfiles(mockUserAddress, pagination)

        expect(result).toEqual({
          friendsProfiles: [createMockProfile('0xfriend1'), createMockProfile('0xfriend2')],
          total: 1
        })

        expect(mockCatalystClient.getProfiles).toHaveBeenCalledWith(['0xfriend1'])
      })
    })
  })
})
