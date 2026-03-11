import { AppComponents } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { PlayerAlreadyBannedError, BanNotFoundError } from './errors'
import { IUserModerationComponent, UserBan, UserWarning, BanStatus } from './types'

export function createUserModerationComponent(
  components: Pick<AppComponents, 'userModerationDb' | 'logs'>
): IUserModerationComponent {
  const { userModerationDb, logs } = components
  const logger = logs.getLogger('user-moderation')

  return {
    async banPlayer(
      address: string,
      bannedBy: string,
      reason: string,
      duration?: number,
      customMessage?: string
    ): Promise<UserBan> {
      const normalizedAddress = normalizeAddress(address)
      const normalizedBannedBy = normalizeAddress(bannedBy)

      const { isBanned } = await userModerationDb.isPlayerBanned(normalizedAddress)
      if (isBanned) {
        throw new PlayerAlreadyBannedError(normalizedAddress)
      }

      const expiresAt = duration ? new Date(Date.now() + duration) : undefined

      logger.info(`Banning player ${normalizedAddress} by ${normalizedBannedBy}`)

      return userModerationDb.createBan({
        bannedAddress: normalizedAddress,
        bannedBy: normalizedBannedBy,
        reason,
        customMessage,
        expiresAt
      })
    },

    async liftBan(address: string, liftedBy: string): Promise<void> {
      const normalizedAddress = normalizeAddress(address)
      const normalizedLiftedBy = normalizeAddress(liftedBy)

      logger.info(`Lifting ban for player ${normalizedAddress} by ${normalizedLiftedBy}`)

      const lifted = await userModerationDb.liftBan(normalizedAddress, normalizedLiftedBy)
      if (!lifted) {
        throw new BanNotFoundError(normalizedAddress)
      }
    },

    async warnPlayer(address: string, reason: string, warnedBy: string): Promise<UserWarning> {
      const normalizedAddress = normalizeAddress(address)
      const normalizedWarnedBy = normalizeAddress(warnedBy)

      logger.info(`Warning player ${normalizedAddress} by ${normalizedWarnedBy}`)

      return userModerationDb.createWarning({
        warnedAddress: normalizedAddress,
        warnedBy: normalizedWarnedBy,
        reason
      })
    },

    async isPlayerBanned(address: string): Promise<BanStatus> {
      const normalizedAddress = normalizeAddress(address)
      return userModerationDb.isPlayerBanned(normalizedAddress)
    },

    async getActiveBans(): Promise<UserBan[]> {
      return userModerationDb.getActiveBans()
    },

    async getPlayerWarnings(address: string): Promise<UserWarning[]> {
      const normalizedAddress = normalizeAddress(address)
      return userModerationDb.getPlayerWarnings(normalizedAddress)
    }
  }
}
