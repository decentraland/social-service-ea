import {
  GetPrivateMessagesSettingsPayload,
  GetPrivateMessagesSettingsResponse,
  PrivateMessagePrivacySetting
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { convertDBSettingsToRPCSettings } from '../../../logic/settings'
import { isErrorWithMessage } from '../../../utils/errors'

const MAX_USER_ADDRESSES = 50

export function getPrivateMessagesSettingsService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('get-private-messages-settings-service')

  return async function (
    request: GetPrivateMessagesSettingsPayload,
    context: RpcServerContext
  ): Promise<GetPrivateMessagesSettingsResponse> {
    try {
      const userAddresses = request.user.map((user) => user.address.toLowerCase())

      if (userAddresses.length > MAX_USER_ADDRESSES) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: {
              message: `Too many user addresses: ${userAddresses.length}`
            }
          }
        }
      }

      // Create base message privacy information map
      const privacyInformation = userAddresses.reduce(
        (acc, address) => {
          acc[address] = { privacy: PrivateMessagePrivacySetting.ALL, isFriend: false }
          return acc
        },
        {} as Record<string, { privacy: PrivateMessagePrivacySetting; isFriend: boolean }>
      )

      const [settings, friendsOfConnectedAddress] =
        userAddresses.length > 0
          ? await Promise.all([
              db.getSocialSettings(userAddresses),
              db.getFriendsFromList(context.address, userAddresses)
            ])
          : [[], []]

      settings.forEach((setting) => {
        privacyInformation[setting.address].privacy = convertDBSettingsToRPCSettings(setting).privateMessagesPrivacy
      })

      friendsOfConnectedAddress.forEach((friend) => {
        privacyInformation[friend.address].isFriend = true
      })

      return {
        response: {
          $case: 'ok',
          ok: {
            settings: Object.entries(privacyInformation).map(([address, { privacy, isFriend }]) => ({
              user: {
                address
              },
              privateMessagesPrivacy: privacy,
              isFriend
            }))
          }
        }
      }
    } catch (error) {
      console.error('Error getting private messages settings', error)
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
