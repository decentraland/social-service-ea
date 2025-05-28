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

export function upsertSocialSettingsService({
  components: { logs, friendsDb, commsGatekeeper }
}: RPCServiceContext<'logs' | 'friendsDb' | 'commsGatekeeper'>) {
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

      const dbSettings = convertRPCSettingsIntoDBSettings(request)

      // Update the private message privacy metadata in the comms gatekeeper and the database
      const [_, settings] = await Promise.all([
        dbSettings.private_messages_privacy !== undefined
          ? await commsGatekeeper
              .updateUserPrivateMessagePrivacyMetadata(context.address, dbSettings.private_messages_privacy)
              // Ignore errors
              .catch((_) => undefined)
          : Promise.resolve(),
        friendsDb.upsertSocialSettings(context.address, dbSettings)
      ])

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
