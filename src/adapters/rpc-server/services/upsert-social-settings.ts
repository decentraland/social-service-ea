import {
  UpsertSocialSettingsPayload,
  UpsertSocialSettingsResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import {
  convertDBSettingsToRPCSettings,
  convertRPCSettingsIntoDBSettings,
  InvalidSocialSettingsError
} from '../../../logic/settings'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { isErrorWithMessage } from '../../../utils/errors'

export function upsertSocialSettingsService({ components: { logs, db } }: RPCServiceContext<'logs' | 'db'>) {
  const logger = logs.getLogger('upsert-social-settings-service')

  return async function (
    request: UpsertSocialSettingsPayload,
    context: RpcServerContext
  ): Promise<UpsertSocialSettingsResponse> {
    try {
      if (request.privateMessagesPrivacy === undefined && request.blockedUsersMessagesVisibility === undefined) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: {
              message: 'At least one setting to update must be provided'
            }
          }
        }
      }

      const settings = await db.upsertSocialSettings(context.address, convertRPCSettingsIntoDBSettings(request))

      return {
        response: {
          $case: 'ok',
          ok: convertDBSettingsToRPCSettings(settings)
        }
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error'
      logger.error(`Error updating or inserting social settings: ${errorMessage}`)
      if (error instanceof InvalidSocialSettingsError) {
        return {
          response: {
            $case: 'invalidRequest',
            invalidRequest: {
              message: errorMessage
            }
          }
        }
      }
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
