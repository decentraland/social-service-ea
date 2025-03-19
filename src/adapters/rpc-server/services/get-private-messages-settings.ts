import {
  GetPrivateMessagesSettingsPayload,
  GetPrivateMessagesSettingsResponse,
  PrivateMessagePrivacySetting
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { convertDBSettingsToRPCSettings } from '../../../logic/settings'
import { isErrorWithMessage } from '../../../utils/errors'

export function getPrivateMessagesSettingsService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-private-messages-settings-service')

  return async function (
    request: GetPrivateMessagesSettingsPayload,
    _: RpcServerContext
  ): Promise<GetPrivateMessagesSettingsResponse> {
    try {
      const userAddresses = request.user.map((user) => user.address.toLowerCase())

      // Create base message privacy settings map
      const privacySettings = userAddresses.reduce(
        (acc, address) => {
          acc[address] = PrivateMessagePrivacySetting.ONLY_FRIENDS
          return acc
        },
        {} as Record<string, PrivateMessagePrivacySetting>
      )

      const settings = userAddresses.length > 0 ? await db.getSocialSettings(userAddresses) : []

      settings.forEach((setting) => {
        privacySettings[setting.address] = convertDBSettingsToRPCSettings(setting).privateMessagesPrivacy
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            settings: Object.entries(privacySettings).map(([address, privacy]) => ({
              user: {
                address
              },
              privateMessagesPrivacy: privacy
            }))
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error'
      logger.error(`Error getting private messages settings: ${errorMessage}`)
      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {
            message: errorMessage
          }
        }
      }
    }
  }
}
