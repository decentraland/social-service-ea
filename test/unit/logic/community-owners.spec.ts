import { createCommunityOwnersComponent } from '../../../src/logic/community/owners'
import { ICommunityOwnersComponent } from '../../../src/logic/community/types'
import { CommunityOwnerNotFoundError } from '../../../src/logic/community/errors'
import { mockRegistry } from '../../mocks/components'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

describe('community-owners', () => {
  let communityOwners: ICommunityOwnersComponent
  let mockRegistryInstance: jest.Mocked<typeof mockRegistry>

  beforeEach(() => {
    // Create a fresh mock instance for each test to avoid interference
    mockRegistryInstance = {
      getProfiles: jest.fn(),
      getProfile: jest.fn()
    }
    communityOwners = createCommunityOwnersComponent({
      registry: mockRegistryInstance
    })
  })

  describe('when getting owners names', () => {
    const ownerAddresses = [
      '0x1234567890123456789012345678901234567890',
      '0x9876543210987654321098765432109876543210',
      '0x1111111111111111111111111111111111111111'
    ]

    describe('and all profiles exist with claimed names', () => {
      const mockProfiles: Profile[] = [
        {
          avatars: [
            {
              ethAddress: ownerAddresses[0],
              userId: ownerAddresses[0],
              name: 'John Doe',
              hasClaimedName: true,
              unclaimedName: undefined,
              avatar: {
                snapshots: {
                  face256: 'https://example.com/avatar1.jpg'
                }
              }
            }
          ]
        },
        {
          avatars: [
            {
              ethAddress: ownerAddresses[1],
              userId: ownerAddresses[1],
              name: 'Jane Smith',
              hasClaimedName: true,
              unclaimedName: undefined,
              avatar: {
                snapshots: {
                  face256: 'https://example.com/avatar2.jpg'
                }
              }
            }
          ]
        },
        {
          avatars: [
            {
              ethAddress: ownerAddresses[2],
              userId: ownerAddresses[2],
              name: 'Bob Wilson',
              hasClaimedName: true,
              unclaimedName: undefined,
              avatar: {
                snapshots: {
                  face256: 'https://example.com/avatar3.jpg'
                }
              }
            }
          ]
        }
      ]

      beforeEach(() => {
        mockRegistryInstance.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should return a record mapping addresses to names', async () => {
        const result = await communityOwners.getOwnersNames(ownerAddresses)

        expect(mockRegistryInstance.getProfiles).toHaveBeenCalledWith(ownerAddresses)
        expect(result).toEqual({
          [ownerAddresses[0]]: 'John Doe',
          [ownerAddresses[1]]: 'Jane Smith',
          [ownerAddresses[2]]: 'Bob Wilson'
        })
      })
    })

    describe('and profiles exist with mixed claimed and unclaimed names', () => {
      const mockProfiles: Profile[] = [
        {
          avatars: [
            {
              ethAddress: ownerAddresses[0],
              userId: ownerAddresses[0],
              name: 'John Doe',
              hasClaimedName: true,
              unclaimedName: 'UnclaimedUser123',
              avatar: {
                snapshots: {
                  face256: 'https://example.com/avatar1.jpg'
                }
              }
            }
          ]
        },
        {
          avatars: [
            {
              ethAddress: ownerAddresses[1],
              userId: ownerAddresses[1],
              name: undefined,
              hasClaimedName: false,
              unclaimedName: 'UnclaimedUser456',
              avatar: {
                snapshots: {
                  face256: 'https://example.com/avatar2.jpg'
                }
              }
            }
          ]
        }
      ]

      beforeEach(() => {
        mockRegistryInstance.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should prioritize claimed names over unclaimed names', async () => {
        const result = await communityOwners.getOwnersNames(ownerAddresses.slice(0, 2))

        expect(mockRegistryInstance.getProfiles).toHaveBeenCalledWith(ownerAddresses.slice(0, 2))
        expect(result).toEqual({
          [ownerAddresses[0]]: 'John Doe', // claimed name takes priority
          [ownerAddresses[1]]: 'UnclaimedUser456' // unclaimed name when no claimed name
        })
      })
    })

    describe('and some profiles are missing', () => {
      const mockProfiles: Profile[] = [
        {
          avatars: [
            {
              ethAddress: ownerAddresses[0],
              userId: ownerAddresses[0],
              name: 'John Doe',
              hasClaimedName: true,
              unclaimedName: undefined,
              avatar: {
                snapshots: {
                  face256: 'https://example.com/avatar1.jpg'
                }
              }
            }
          ]
        }
        // Missing profiles for ownerAddresses[1] and ownerAddresses[2]
      ]

      beforeEach(() => {
        mockRegistryInstance.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should only return names for profiles that exist', async () => {
        const result = await communityOwners.getOwnersNames(ownerAddresses)

        expect(mockRegistryInstance.getProfiles).toHaveBeenCalledWith(ownerAddresses)
        expect(result).toEqual({
          [ownerAddresses[0]]: 'John Doe'
        })
      })
    })

    describe('and no profiles are found', () => {
      beforeEach(() => {
        mockRegistryInstance.getProfiles.mockResolvedValue([])
      })

      it('should return an empty record', async () => {
        const result = await communityOwners.getOwnersNames(ownerAddresses)

        expect(mockRegistryInstance.getProfiles).toHaveBeenCalledWith(ownerAddresses)
        expect(result).toEqual({})
      })
    })

    describe('and empty address array is provided', () => {
      beforeEach(() => {
        mockRegistryInstance.getProfiles.mockResolvedValue([])
      })

      it('should return an empty record', async () => {
        const result = await communityOwners.getOwnersNames([])

        expect(mockRegistryInstance.getProfiles).toHaveBeenCalledWith([])
        expect(result).toEqual({})
      })
    })

    describe('and a profile has no avatars', () => {
      const mockProfiles: Profile[] = [
        {
          avatars: []
        }
      ]

      beforeEach(() => {
        mockRegistryInstance.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should skip profiles with no avatars', async () => {
        const result = await communityOwners.getOwnersNames(ownerAddresses.slice(0, 1))

        expect(mockRegistryInstance.getProfiles).toHaveBeenCalledWith(ownerAddresses.slice(0, 1))
        expect(result).toEqual({})
      })
    })

    describe('and a profile avatar has no name information', () => {
      const mockProfiles: Profile[] = [
        {
          avatars: [
            {
              ethAddress: ownerAddresses[0],
              userId: ownerAddresses[0],
              name: undefined,
              hasClaimedName: false,
              unclaimedName: undefined,
              avatar: {
                snapshots: {
                  face256: 'https://example.com/avatar1.jpg'
                }
              }
            }
          ]
        }
      ]

      beforeEach(() => {
        mockRegistryInstance.getProfiles.mockResolvedValue(mockProfiles)
      })

      it('should skip profiles with no name information', async () => {
        const result = await communityOwners.getOwnersNames(ownerAddresses.slice(0, 1))

        expect(mockRegistryInstance.getProfiles).toHaveBeenCalledWith(ownerAddresses.slice(0, 1))
        expect(result).toEqual({})
      })
    })

    describe('and the catalyst client throws an error', () => {
      const catalystError = new Error('Catalyst service unavailable')

      beforeEach(() => {
        mockRegistryInstance.getProfiles.mockRejectedValue(catalystError)
      })

      it('should propagate the catalyst client error', async () => {
        await expect(communityOwners.getOwnersNames(ownerAddresses)).rejects.toThrow(
          'Catalyst service unavailable'
        )

        expect(mockRegistryInstance.getProfiles).toHaveBeenCalledWith(ownerAddresses)
      })
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
        mockRegistryInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should return the claimed name', async () => {
        const result = await communityOwners.getOwnerName(ownerAddress, communityId)

        expect(mockRegistryInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
        expect(result).toBe('John Doe')
      })

      it('should work without providing community ID', async () => {
        const result = await communityOwners.getOwnerName(ownerAddress)

        expect(mockRegistryInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
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
        mockRegistryInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should return the unclaimed name', async () => {
        const result = await communityOwners.getOwnerName(ownerAddress, communityId)

        expect(mockRegistryInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
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
        mockRegistryInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should prioritize the claimed name over unclaimed name', async () => {
        const result = await communityOwners.getOwnerName(ownerAddress, communityId)

        expect(mockRegistryInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
        expect(result).toBe('John Doe')
      })
    })

    describe('and the profile has no avatars', () => {
      const mockProfile: Profile = {
        avatars: []
      }

      beforeEach(() => {
        mockRegistryInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should throw an error when trying to get profile name', async () => {
        await expect(communityOwners.getOwnerName(ownerAddress, communityId)).rejects.toThrow(
          'Missing profile avatar'
        )

        expect(mockRegistryInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
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
        mockRegistryInstance.getProfile.mockResolvedValue(mockProfile)
      })

      it('should throw an error when no name is available', async () => {
        await expect(communityOwners.getOwnerName(ownerAddress, communityId)).rejects.toThrow(
          'Missing profile avatar name'
        )

        expect(mockRegistryInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
      })
    })

    describe('and the profile is not found', () => {
      beforeEach(() => {
        // Reset the mock and explicitly set it to return null
        mockRegistryInstance.getProfile.mockReset()
        mockRegistryInstance.getProfile.mockResolvedValue(null)
      })

      it('should throw CommunityOwnerNotFoundError with community ID and owner address', async () => {
        await expect(communityOwners.getOwnerName(ownerAddress, communityId)).rejects.toThrow(
          CommunityOwnerNotFoundError
        )

        expect(mockRegistryInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
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
        mockRegistryInstance.getProfile.mockRejectedValue(catalystError)
      })

      it('should propagate the catalyst client error', async () => {
        await expect(communityOwners.getOwnerName(ownerAddress, communityId)).rejects.toThrow(
          'Catalyst service unavailable'
        )

        expect(mockRegistryInstance.getProfile).toHaveBeenCalledWith(ownerAddress)
      })
    })
  })
}) 