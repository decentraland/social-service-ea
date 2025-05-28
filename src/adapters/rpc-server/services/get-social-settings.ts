import { GetSocialSettingsResponse } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { convertDBSettingsToRPCSettings, getDefaultSettings } from '../../../logic/settings'
import { isErrorWithMessage } from '../../../utils/errors'

export function getSocialSettingsService({ components: { logs, friendsDb } }: RPCServiceContext<'logs' | 'friendsDb'>) {
  const logger = logs.getLogger('get-social-settings-service')

  return async function (_: Empty, context: RpcServerContext): Promise<GetSocialSettingsResponse> {
    try {
      let settings = await friendsDb.getSocialSettings([context.address])

      // Return the default settings if no settings are found
      if (!settings || settings.length === 0) {
        settings = [getDefaultSettings(context.address)]
      }

      return {
        response: {
          $case: 'ok',
          ok: {
            settings: convertDBSettingsToRPCSettings(settings[0])
          }
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error'
      logger.error(`Error getting social settings: ${errorMessage}`)
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
