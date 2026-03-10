import { createUserModerationComponent } from '../../../src/logic/user-moderation'
import { PlayerAlreadyBannedError, BanNotFoundError } from '../../../src/logic/user-moderation/errors'
import { IUserModerationComponent, UserBan, UserWarning } from '../../../src/logic/user-moderation/types'
import { IUserModerationDatabaseComponent } from '../../../src/types/components'

const makeBan = (overrides: Partial<UserBan> = {}): UserBan => ({
  id: 'ban-id',
  bannedAddress: '0xabc',
  bannedBy: '0xadmin',
  reason: 'Violation',
  customMessage: null,
  bannedAt: new Date('2025-01-01'),
  expiresAt: null,
  liftedAt: null,
  liftedBy: null,
  createdAt: new Date('2025-01-01'),
  ...overrides
})

const makeWarning = (overrides: Partial<UserWarning> = {}): UserWarning => ({
  id: 'warning-id',
  warnedAddress: '0xabc',
  warnedBy: '0xadmin',
  reason: 'Minor violation',
  warnedAt: new Date('2025-01-01'),
  createdAt: new Date('2025-01-01'),
  ...overrides
})

describe('user-moderation-component', () => {
  let mockUserModerationDb: jest.Mocked<IUserModerationDatabaseComponent>
  let mockLogs: any
  let component: IUserModerationComponent

  beforeEach(() => {
    mockUserModerationDb = {
      createBan: jest.fn(),
      liftBan: jest.fn(),
      isPlayerBanned: jest.fn(),
      getActiveBans: jest.fn(),
      createWarning: jest.fn(),
      getPlayerWarnings: jest.fn(),
      getBanHistory: jest.fn()
    }

    mockLogs = {
      getLogger: jest.fn().mockReturnValue({
        log: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
      })
    }

    component = createUserModerationComponent({
      userModerationDb: mockUserModerationDb,
      logs: mockLogs
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when banning a player', () => {
    describe('and no duration is provided', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
      })

      it('should create a permanent ban with expiresAt undefined', async () => {
        const result = await component.banPlayer('0xABC', '0xADMIN', 'Violation')

        expect(result).toEqual(ban)
        expect(mockUserModerationDb.createBan).toHaveBeenCalledWith({
          bannedAddress: '0xabc',
          bannedBy: '0xadmin',
          reason: 'Violation',
          customMessage: undefined,
          expiresAt: undefined
        })
      })
    })

    describe('and a duration is provided', () => {
      let ban: UserBan
      let duration: number

      beforeEach(() => {
        duration = 24 * 60 * 60 * 1000
        ban = makeBan({ expiresAt: new Date(Date.now() + duration) })
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
      })

      it('should pass expiresAt to the adapter', async () => {
        const result = await component.banPlayer('0xABC', '0xADMIN', 'Violation', duration)

        expect(result).toEqual(ban)
        expect(mockUserModerationDb.createBan).toHaveBeenCalledWith(
          expect.objectContaining({
            expiresAt: expect.any(Date)
          })
        )
      })
    })

    describe('and a custom message is provided', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan({ customMessage: 'You have been banned' })
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
      })

      it('should pass the custom message through to the adapter', async () => {
        await component.banPlayer('0xABC', '0xADMIN', 'Violation', undefined, 'You have been banned')

        expect(mockUserModerationDb.createBan).toHaveBeenCalledWith(
          expect.objectContaining({
            customMessage: 'You have been banned'
          })
        )
      })
    })

    describe('and the player is already banned', () => {
      let existingBan: UserBan

      beforeEach(() => {
        existingBan = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: true, ban: existingBan })
      })

      it('should throw PlayerAlreadyBannedError', async () => {
        await expect(component.banPlayer('0xABC', '0xADMIN', 'Violation')).rejects.toThrow(PlayerAlreadyBannedError)
      })

      it('should not call createBan on the adapter', async () => {
        await expect(component.banPlayer('0xABC', '0xADMIN', 'Violation')).rejects.toThrow()

        expect(mockUserModerationDb.createBan).not.toHaveBeenCalled()
      })
    })

    describe('and the player was previously banned but the ban was lifted', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
      })

      it('should create a new ban successfully', async () => {
        const result = await component.banPlayer('0xABC', '0xADMIN', 'New violation')

        expect(result).toEqual(ban)
      })
    })

    describe('and the addresses have mixed casing', () => {
      beforeEach(() => {
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(makeBan())
      })

      it('should normalize all addresses to lowercase', async () => {
        await component.banPlayer('0xABC', '0xADMIN', 'Violation')

        expect(mockUserModerationDb.isPlayerBanned).toHaveBeenCalledWith('0xabc')
        expect(mockUserModerationDb.createBan).toHaveBeenCalledWith(
          expect.objectContaining({
            bannedAddress: '0xabc',
            bannedBy: '0xadmin'
          })
        )
      })
    })
  })

  describe('when lifting a ban', () => {
    describe('and an active ban exists', () => {
      beforeEach(() => {
        mockUserModerationDb.liftBan.mockResolvedValueOnce(true)
      })

      it('should delegate to the adapter with normalized addresses', async () => {
        await component.liftBan('0xABC', '0xADMIN')

        expect(mockUserModerationDb.liftBan).toHaveBeenCalledWith('0xabc', '0xadmin')
      })
    })

    describe('and no active ban exists', () => {
      beforeEach(() => {
        mockUserModerationDb.liftBan.mockResolvedValueOnce(false)
      })

      it('should throw BanNotFoundError', async () => {
        await expect(component.liftBan('0xABC', '0xADMIN')).rejects.toThrow(BanNotFoundError)
      })
    })
  })

  describe('when warning a player', () => {
    let warning: UserWarning

    beforeEach(() => {
      warning = makeWarning()
      mockUserModerationDb.createWarning.mockResolvedValueOnce(warning)
    })

    it('should create a warning and return it', async () => {
      const result = await component.warnPlayer('0xABC', 'Minor violation', '0xADMIN')

      expect(result).toEqual(warning)
    })

    it('should delegate to the adapter with normalized addresses', async () => {
      await component.warnPlayer('0xABC', 'Minor violation', '0xADMIN')

      expect(mockUserModerationDb.createWarning).toHaveBeenCalledWith({
        warnedAddress: '0xabc',
        warnedBy: '0xadmin',
        reason: 'Minor violation'
      })
    })
  })

  describe('when checking if a player is banned', () => {
    describe('and the player has an active ban', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: true, ban })
      })

      it('should return isBanned true with the ban record', async () => {
        const result = await component.isPlayerBanned('0xABC')

        expect(result).toEqual({ isBanned: true, ban })
      })
    })

    describe('and the player has no active ban', () => {
      beforeEach(() => {
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
      })

      it('should return isBanned false', async () => {
        const result = await component.isPlayerBanned('0xABC')

        expect(result).toEqual({ isBanned: false })
      })
    })

    describe('and the address has mixed casing', () => {
      beforeEach(() => {
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
      })

      it('should normalize the address to lowercase', async () => {
        await component.isPlayerBanned('0xABC')

        expect(mockUserModerationDb.isPlayerBanned).toHaveBeenCalledWith('0xabc')
      })
    })
  })

  describe('when getting active bans', () => {
    describe('and there are active bans', () => {
      let bans: UserBan[]

      beforeEach(() => {
        bans = [makeBan(), makeBan({ id: 'ban-2', bannedAddress: '0xdef' })]
        mockUserModerationDb.getActiveBans.mockResolvedValueOnce(bans)
      })

      it('should return all active bans from the adapter', async () => {
        const result = await component.getActiveBans()

        expect(result).toEqual(bans)
      })
    })

    describe('and there are no active bans', () => {
      beforeEach(() => {
        mockUserModerationDb.getActiveBans.mockResolvedValueOnce([])
      })

      it('should return an empty array', async () => {
        const result = await component.getActiveBans()

        expect(result).toEqual([])
      })
    })
  })

  describe('when getting player warnings', () => {
    describe('and the player has warnings', () => {
      let warnings: UserWarning[]

      beforeEach(() => {
        warnings = [makeWarning(), makeWarning({ id: 'warning-2' })]
        mockUserModerationDb.getPlayerWarnings.mockResolvedValueOnce(warnings)
      })

      it('should return all warnings from the adapter', async () => {
        const result = await component.getPlayerWarnings('0xABC')

        expect(result).toEqual(warnings)
      })
    })

    describe('and the player has no warnings', () => {
      beforeEach(() => {
        mockUserModerationDb.getPlayerWarnings.mockResolvedValueOnce([])
      })

      it('should return an empty array', async () => {
        const result = await component.getPlayerWarnings('0xABC')

        expect(result).toEqual([])
      })
    })

    describe('and the address has mixed casing', () => {
      beforeEach(() => {
        mockUserModerationDb.getPlayerWarnings.mockResolvedValueOnce([])
      })

      it('should normalize the address to lowercase', async () => {
        await component.getPlayerWarnings('0xABC')

        expect(mockUserModerationDb.getPlayerWarnings).toHaveBeenCalledWith('0xabc')
      })
    })
  })
})
