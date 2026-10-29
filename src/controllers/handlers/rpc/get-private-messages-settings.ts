import {
  GetPrivateMessagesSettingsPayload,
  GetPrivateMessagesSettingsResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { SubscriptionContext, RPCServiceContext } from '../../../types'
import {
  convertDBPrivateMessagesPrivacyToRPCSetting,
  MAX_PRIVATE_MESSAGES_SETTINGS_ADDRESSES
} from '../../../logic/settings'
import { isErrorWithMessage } from '../../../utils/errors'

export function getPrivateMessagesSettingsService({
  components: { logs, settings }
}: RPCServiceContext<'logs' | 'settings'>) {
  const logger = logs.getLogger('get-private-messages-settings-service')

  return async function (
    request: GetPrivateMessagesSettingsPayload,
    context: SubscriptionContext
  ): Promise<GetPrivateMessagesSettingsResponse> {
    try {
      const userAddresses = request.user.map((user) => user.address)

      if (userAddresses.length > MAX_PRIVATE_MESSAGES_SETTINGS_ADDRESSES) {
        logger.warn(`Too many user private messages settings requested: ${userAddresses.length}`)
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: {
              message: `Too many user addresses: ${userAddresses.length}`
            }
          }
        }
      }

      const privateMessagesSettings = await settings.getPrivateMessagesSettings(context.address, userAddresses)

      return {
        response: {
          $case: 'ok',
          ok: {
            settings: privateMessagesSettings.map(({ address, privateMessagesPrivacy, isFriend }) => ({
              user: {
                address
              },
              privateMessagesPrivacy: convertDBPrivateMessagesPrivacyToRPCSetting(privateMessagesPrivacy),
              isFriend
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
