import { createUserMutesComponent } from '../../../src/logic/user-mutes/component'
import { IUserMutesComponent } from '../../../src/logic/user-mutes/types'
import { SelfMuteError } from '../../../src/logic/user-mutes/errors'
import { createUserMutesDbMockedComponent } from '../../mocks/components/user-mutes-db'
import { mockLogs } from '../../mocks/components'
import { IUserMutesDatabaseComponent } from '../../../src/types/components'

let userMutesComponent: IUserMutesComponent
let mockUserMutesDb: jest.Mocked<IUserMutesDatabaseComponent>

beforeEach(async () => {
  mockUserMutesDb = createUserMutesDbMockedComponent()
  userMutesComponent = await createUserMutesComponent({
    userMutesDb: mockUserMutesDb,
    logs: mockLogs
  })
})

describe('when muting a user', () => {
  describe('and the mute is valid', () => {
    beforeEach(() => {
      mockUserMutesDb.addMute.mockResolvedValue({ muted_at: new Date() })
    })

    it('should call the database adapter', async () => {
      await userMutesComponent.muteUser(
        '0x1234567890123456789012345678901234567890',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      )

      expect(mockUserMutesDb.addMute).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      )
    })
  })

  describe('and the user tries to mute themselves', () => {
    it('should throw a SelfMuteError', async () => {
      await expect(
        userMutesComponent.muteUser(
          '0x1234567890123456789012345678901234567890',
          '0x1234567890123456789012345678901234567890'
        )
      ).rejects.toThrow(SelfMuteError)
    })

    it('should not call the database adapter', async () => {
      try {
        await userMutesComponent.muteUser(
          '0x1234567890123456789012345678901234567890',
          '0x1234567890123456789012345678901234567890'
        )
      } catch (_) {}

      expect(mockUserMutesDb.addMute).not.toHaveBeenCalled()
    })
  })

  describe('and the user tries to mute themselves with different casing', () => {
    it('should throw a SelfMuteError', async () => {
      await expect(
        userMutesComponent.muteUser(
          '0x1234567890ABCDEF1234567890ABCDEF12345678',
          '0x1234567890abcdef1234567890abcdef12345678'
        )
      ).rejects.toThrow(SelfMuteError)
    })
  })

  describe('and the database adapter fails', () => {
    beforeEach(() => {
      mockUserMutesDb.addMute.mockRejectedValue(new Error('Database error'))
    })

    it('should propagate the error', async () => {
      await expect(
        userMutesComponent.muteUser(
          '0x1234567890123456789012345678901234567890',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
        )
      ).rejects.toThrow('Database error')
    })
  })
})

describe('when unmuting a user', () => {
  describe('and the unmute is valid', () => {
    beforeEach(() => {
      mockUserMutesDb.removeMute.mockResolvedValue()
    })

    it('should call the database adapter', async () => {
      await userMutesComponent.unmuteUser(
        '0x1234567890123456789012345678901234567890',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      )

      expect(mockUserMutesDb.removeMute).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      )
    })
  })

  describe('and the database adapter fails', () => {
    beforeEach(() => {
      mockUserMutesDb.removeMute.mockRejectedValue(new Error('Database error'))
    })

    it('should propagate the error', async () => {
      await expect(
        userMutesComponent.unmuteUser(
          '0x1234567890123456789012345678901234567890',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
        )
      ).rejects.toThrow('Database error')
    })
  })
})

describe('when getting muted users', () => {
  const muterAddress = '0x1234567890123456789012345678901234567890'
  const pagination = { limit: 10, offset: 0 }

  describe('and there are muted users', () => {
    const mockResult = {
      mutes: [
        { address: '0xaaaa000000000000000000000000000000000001', muted_at: new Date('2024-01-01') },
        { address: '0xaaaa000000000000000000000000000000000002', muted_at: new Date('2024-01-02') }
      ],
      total: 2
    }

    beforeEach(() => {
      mockUserMutesDb.getMutedUsers.mockResolvedValue(mockResult)
    })

    it('should return mutes and total count', async () => {
      const result = await userMutesComponent.getMutedUsers(muterAddress, pagination)

      expect(result).toEqual(mockResult)
    })

    it('should pass pagination to the database adapter', async () => {
      await userMutesComponent.getMutedUsers(muterAddress, pagination)

      expect(mockUserMutesDb.getMutedUsers).toHaveBeenCalledWith(muterAddress, {
        pagination,
        address: undefined,
        addresses: undefined
      })
    })
  })

  describe('and filtering by a single address', () => {
    beforeEach(() => {
      mockUserMutesDb.getMutedUsers.mockResolvedValue({
        mutes: [{ address: '0xaaaa000000000000000000000000000000000001', muted_at: new Date('2024-01-01') }],
        total: 1
      })
    })

    it('should pass the address filter to the database adapter', async () => {
      await userMutesComponent.getMutedUsers(muterAddress, pagination, {
        address: '0xaaaa000000000000000000000000000000000001'
      })

      expect(mockUserMutesDb.getMutedUsers).toHaveBeenCalledWith(muterAddress, {
        pagination,
        address: '0xaaaa000000000000000000000000000000000001',
        addresses: undefined
      })
    })
  })

  describe('and filtering by multiple addresses', () => {
    const addresses = ['0xaaaa000000000000000000000000000000000001', '0xaaaa000000000000000000000000000000000002']

    beforeEach(() => {
      mockUserMutesDb.getMutedUsers.mockResolvedValue({
        mutes: [
          { address: '0xaaaa000000000000000000000000000000000001', muted_at: new Date('2024-01-01') },
          { address: '0xaaaa000000000000000000000000000000000002', muted_at: new Date('2024-01-02') }
        ],
        total: 2
      })
    })

    it('should pass the addresses filter to the database adapter', async () => {
      await userMutesComponent.getMutedUsers(muterAddress, pagination, { addresses })

      expect(mockUserMutesDb.getMutedUsers).toHaveBeenCalledWith(muterAddress, {
        pagination,
        address: undefined,
        addresses
      })
    })
  })

  describe('and there are no muted users', () => {
    beforeEach(() => {
      mockUserMutesDb.getMutedUsers.mockResolvedValue({ mutes: [], total: 0 })
    })

    it('should return empty results', async () => {
      const result = await userMutesComponent.getMutedUsers(muterAddress, pagination)

      expect(result).toEqual({ mutes: [], total: 0 })
    })
  })
})
