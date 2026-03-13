import { AppComponents } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { PlayerAlreadyBannedError, BanNotFoundError } from './errors'
import { createBanEvent, createBanLiftedEvent, createWarningEvent, publishModerationEvent } from './events'
import { IUserModerationComponent, UserBan, UserWarning, BanStatus } from './types'

export function createUserModerationComponent(
  components: Pick<AppComponents, 'userModerationDb' | 'logs' | 'sns'>
): IUserModerationComponent {
  const { userModerationDb, logs, sns } = components
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

      const ban = await userModerationDb.createBan({
        bannedAddress: normalizedAddress,
        bannedBy: normalizedBannedBy,
        reason,
        customMessage,
        expiresAt
      })

      void publishModerationEvent(sns, createBanEvent(ban), logger)

      return ban
    },

    async liftBan(address: string, liftedBy: string): Promise<void> {
      const normalizedAddress = normalizeAddress(address)
      const normalizedLiftedBy = normalizeAddress(liftedBy)

      logger.info(`Lifting ban for player ${normalizedAddress} by ${normalizedLiftedBy}`)

      const ban = await userModerationDb.liftBan(normalizedAddress, normalizedLiftedBy)
      if (!ban) {
        throw new BanNotFoundError(normalizedAddress)
      }

      void publishModerationEvent(sns, createBanLiftedEvent(ban), logger)
    },

    async warnPlayer(address: string, reason: string, warnedBy: string): Promise<UserWarning> {
      const normalizedAddress = normalizeAddress(address)
      const normalizedWarnedBy = normalizeAddress(warnedBy)

      logger.info(`Warning player ${normalizedAddress} by ${normalizedWarnedBy}`)

      const warning = await userModerationDb.createWarning({
        warnedAddress: normalizedAddress,
        warnedBy: normalizedWarnedBy,
        reason
      })

      void publishModerationEvent(sns, createWarningEvent(warning), logger)

      return warning
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
