import { createCommunityOwnersComponent } from '../../../src/logic/community/owners'
import { ICommunityOwnersComponent } from '../../../src/logic/community/types'
import { CommunityOwnerNotFoundError } from '../../../src/logic/community/errors'
import { mockCatalystClient } from '../../mocks/components'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

describe('community-owners', () => {
  let communityOwners: ICommunityOwnersComponent
  let mockCatalystClientInstance: jest.Mocked<typeof mockCatalystClient>

  beforeEach(() => {
    // Create a fresh mock instance for each test to avoid interference
    mockCatalystClientInstance = {
      getProfiles: jest.fn(),
      getProfile: jest.fn(),
      getOwnedNames: jest.fn()
    }
    communityOwners = createCommunityOwnersComponent({
      catalystClient: mockCatalystClientInstance
    })
  })

  describe('when getting owner name', () => {
    const ownerAddress = '0x1234567890123456789012345678901234567890'
    const communityId = 'test-community-123'

    describe('and the profile exists with a claimed name', () => {
      const mockProfile: Profile = {
        avatars: [
          {
            ethAddress: ownerAddress,
            userId: ownerAddress,
            name: 'John Doe',
            hasClaimedName: true,
            unclaimedName: undefined,
            avatar: {
              snapshots: {
                face256: 'https://example.com/avatar.jpg'
              }
            }
          }
        ]
      }

      beforeEach(() => {
        mockCatalystClientInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should return the claimed name', async () => {
        const result = await communityOwners.getOwnerName(ownerAddress, communityId)

        expect(mockCatalystClientInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
        expect(result).toBe('John Doe')
      })

      it('should work without providing community ID', async () => {
        const result = await communityOwners.getOwnerName(ownerAddress)

        expect(mockCatalystClientInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
        expect(result).toBe('John Doe')
      })
    })

    describe('and the profile exists with an unclaimed name', () => {
      const mockProfile: Profile = {
        avatars: [
          {
            ethAddress: ownerAddress,
            userId: ownerAddress,
            name: undefined,
            hasClaimedName: false,
            unclaimedName: 'UnclaimedUser123',
            avatar: {
              snapshots: {
                face256: 'https://example.com/avatar.jpg'
              }
            }
          }
        ]
      }

      beforeEach(() => {
        mockCatalystClientInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should return the unclaimed name', async () => {
        const result = await communityOwners.getOwnerName(ownerAddress, communityId)

        expect(mockCatalystClientInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
        expect(result).toBe('UnclaimedUser123')
      })
    })

    describe('and the profile exists with both claimed and unclaimed names', () => {
      const mockProfile: Profile = {
        avatars: [
          {
            ethAddress: ownerAddress,
            userId: ownerAddress,
            name: 'John Doe',
            hasClaimedName: true,
            unclaimedName: 'UnclaimedUser123',
            avatar: {
              snapshots: {
                face256: 'https://example.com/avatar.jpg'
              }
            }
          }
        ]
      }

      beforeEach(() => {
        mockCatalystClientInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should prioritize the claimed name over unclaimed name', async () => {
        const result = await communityOwners.getOwnerName(ownerAddress, communityId)

        expect(mockCatalystClientInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
        expect(result).toBe('John Doe')
      })
    })

    describe('and the profile has no avatars', () => {
      const mockProfile: Profile = {
        avatars: []
      }

      beforeEach(() => {
        mockCatalystClientInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should throw an error when trying to get profile name', async () => {
        await expect(communityOwners.getOwnerName(ownerAddress, communityId)).rejects.toThrow(
          'Missing profile avatar'
        )

        expect(mockCatalystClientInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
      })
    })

    describe('and the profile avatar has no name information', () => {
      const mockProfile: Profile = {
        avatars: [
          {
            ethAddress: ownerAddress,
            userId: ownerAddress,
            name: undefined,
            hasClaimedName: false,
            unclaimedName: undefined,
            avatar: {
              snapshots: {
                face256: 'https://example.com/avatar.jpg'
              }
            }
          }
        ]
      }

      beforeEach(() => {
        mockCatalystClientInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should throw an error when no name is available', async () => {
        await expect(communityOwners.getOwnerName(ownerAddress, communityId)).rejects.toThrow(
          'Missing profile avatar name'
        )

        expect(mockCatalystClientInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
      })
    })

    describe('and the profile is not found', () => {
      beforeEach(() => {
        // Reset the mock and explicitly set it to return null
        mockCatalystClientInstance.getProfile.mockReset()
        mockCatalystClientInstance.getProfile.mockResolvedValue(null)
      })

      it('should throw CommunityOwnerNotFoundError with community ID and owner address', async () => {
        await expect(communityOwners.getOwnerName(ownerAddress, communityId)).rejects.toThrow(
          CommunityOwnerNotFoundError
        )

        expect(mockCatalystClientInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
      })

      it('should include the correct error message', async () => {
        try {
          await communityOwners.getOwnerName(ownerAddress, communityId)
        } catch (error) {
          expect(error).toBeInstanceOf(CommunityOwnerNotFoundError)
          expect((error as CommunityOwnerNotFoundError).message).toBe(
            `Community owner not found: ${communityId} - ${ownerAddress}`
          )
          expect((error as CommunityOwnerNotFoundError).id).toBe(communityId)
          expect((error as CommunityOwnerNotFoundError).ownerAddress).toBe(ownerAddress)
        }
      })

      it('should use default community ID when not provided', async () => {
        try {
          await communityOwners.getOwnerName(ownerAddress)
        } catch (error) {
          expect(error).toBeInstanceOf(CommunityOwnerNotFoundError)
          expect((error as CommunityOwnerNotFoundError).message).toBe(
            `Community owner not found: N/A - ${ownerAddress}`
          )
          expect((error as CommunityOwnerNotFoundError).id).toBe('N/A')
          expect((error as CommunityOwnerNotFoundError).ownerAddress).toBe(ownerAddress)
        }
      })
    })

    describe('and the catalyst client throws an error', () => {
      const catalystError = new Error('Catalyst service unavailable')

      beforeEach(() => {
        mockCatalystClientInstance.getProfile.mockRejectedValue(catalystError)
      })

      it('should propagate the catalyst client error', async () => {
        await expect(communityOwners.getOwnerName(ownerAddress, communityId)).rejects.toThrow(
          'Catalyst service unavailable'
        )

        expect(mockCatalystClientInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
      })
    })

    describe('and the profile has multiple avatars', () => {
      const mockProfile: Profile = {
        avatars: [
          {
            ethAddress: ownerAddress,
            userId: ownerAddress,
            name: 'First Avatar',
            hasClaimedName: true,
            unclaimedName: undefined,
            avatar: {
              snapshots: {
                face256: 'https://example.com/avatar1.jpg'
              }
            }
          },
          {
            ethAddress: ownerAddress,
            userId: ownerAddress,
            name: 'Second Avatar',
            hasClaimedName: true,
            unclaimedName: undefined,
            avatar: {
              snapshots: {
                face256: 'https://example.com/avatar2.jpg'
              }
            }
          }
        ]
      }

      beforeEach(() => {
        mockCatalystClientInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should use the first avatar in the list', async () => {
        const result = await communityOwners.getOwnerName(ownerAddress, communityId)

        expect(mockCatalystClientInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
        expect(result).toBe('First Avatar')
      })
    })

    describe('and the profile avatar has no avatar snapshots', () => {
      const mockProfile: Profile = {
        avatars: [
          {
            ethAddress: ownerAddress,
            userId: ownerAddress,
            name: 'John Doe',
            hasClaimedName: true,
            unclaimedName: undefined,
            avatar: undefined
          }
        ]
      }

      beforeEach(() => {
        mockCatalystClientInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should still return the name even without avatar snapshots', async () => {
        const result = await communityOwners.getOwnerName(ownerAddress, communityId)

        expect(mockCatalystClientInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
        expect(result).toBe('John Doe')
      })
    })

    describe('and the profile avatar has no avatar object', () => {
      const mockProfile: Profile = {
        avatars: [
          {
            ethAddress: ownerAddress,
            userId: ownerAddress,
            name: 'John Doe',
            hasClaimedName: true,
            unclaimedName: undefined
          }
        ]
      }

      beforeEach(() => {
        mockCatalystClientInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should still return the name even without avatar object', async () => {
        const result = await communityOwners.getOwnerName(ownerAddress, communityId)

        expect(mockCatalystClientInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
        expect(result).toBe('John Doe')
      })
    })
  })
}) 