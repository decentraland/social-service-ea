import { GetSocialSettingsResponse } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { convertDBSettingsToRPCSettings } from '../../../logic/settings/utils'
import { isErrorWithMessage } from '../../../utils/errors'

export function getSocialSettingsService({ components: { logs, settings } }: RPCServiceContext<'logs' | 'settings'>) {
  const logger = logs.getLogger('get-social-settings-service')

  return async function (_: Empty, context: RpcServerContext): Promise<GetSocialSettingsResponse> {
    try {
      const [setting] = await settings.getUsersSettings([context.address])

      return {
        response: {
          $case: 'ok',
          ok: {
            settings: convertDBSettingsToRPCSettings(setting)
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
