import {
  GetPrivateMessagesSettingsPayload,
  GetPrivateMessagesSettingsResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { buildPrivateMessagesRPCSettingsForAddresses } from '../../../logic/settings/utils'
import { isErrorWithMessage } from '../../../utils/errors'

const MAX_USER_ADDRESSES = 50

export function getPrivateMessagesSettingsService({
  components: { logs, friendsDb }
}: RPCServiceContext<'logs' | 'friendsDb'>) {
  const logger = logs.getLogger('get-private-messages-settings-service')

  return async function (
    request: GetPrivateMessagesSettingsPayload,
    context: RpcServerContext
  ): Promise<GetPrivateMessagesSettingsResponse> {
    try {
      const userAddresses = request.user.map((user) => user.address.toLowerCase())

      if (userAddresses.length > MAX_USER_ADDRESSES) {
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

      const [settings, friendsOfConnectedAddress] =
        userAddresses.length > 0
          ? await Promise.all([
              friendsDb.getSocialSettings(userAddresses),
              friendsDb.getFriendsFromList(context.address, userAddresses)
            ])
          : [[], []]

      const privacyInformation = buildPrivateMessagesRPCSettingsForAddresses(
        userAddresses,
        settings,
        friendsOfConnectedAddress
      )

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
