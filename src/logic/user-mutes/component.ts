import { AppComponents } from '../../types'
import { Pagination } from '../../types/entities'
import { IUserMutesComponent } from './types'
import { SelfMuteError } from './errors'

export async function createUserMutesComponent(
  components: Pick<AppComponents, 'userMutesDb' | 'logs'>
): Promise<IUserMutesComponent> {
  const { userMutesDb, logs } = components
  const logger = logs.getLogger('user-mutes-component')

  return {
    muteUser: async (muterAddress: string, mutedAddress: string): Promise<void> => {
      if (muterAddress.toLowerCase() === mutedAddress.toLowerCase()) {
        throw new SelfMuteError()
      }

      await userMutesDb.addMute(muterAddress, mutedAddress)
      logger.info(`User ${muterAddress} muted ${mutedAddress}`)
    },

    unmuteUser: async (muterAddress: string, mutedAddress: string): Promise<void> => {
      await userMutesDb.removeMute(muterAddress, mutedAddress)
      logger.info(`User ${muterAddress} unmuted ${mutedAddress}`)
    },

    getMutedUsers: async (
      muterAddress: string,
      pagination: Required<Pagination>,
      options?: { address?: string; addresses?: string[] }
    ): Promise<{ mutes: { address: string; muted_at: Date }[]; total: number }> => {
      return userMutesDb.getMutedUsers(muterAddress, {
        pagination,
        address: options?.address,
        addresses: options?.addresses
      })
    }
  }
}
