import {
  UpsertSocialSettingsPayload,
  UpsertSocialSettingsResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import {
  convertDBSettingsToRPCSettings,
  convertRPCSettingsIntoDBSettings,
  InvalidSocialSettingsError
} from '../../../logic/settings/utils'
import { RpcServerContext, RPCServiceContext } from '../../../types'
import { isErrorWithMessage } from '../../../utils/errors'
import { PrivateMessagesPrivacy } from '../../../types'

/**
 * Creates the social-settings RPC handler with fail-closed Gatekeeper synchronization.
 *
 * @param context RPC service components.
 * @returns A handler for social-settings updates.
 */
export function upsertSocialSettingsService({
  components: { logs, friendsDb, commsGatekeeper }
}: RPCServiceContext<'logs' | 'friendsDb' | 'commsGatekeeper'>) {
  const logger = logs.getLogger('upsert-social-settings-service')

  return async function (
    request: UpsertSocialSettingsPayload,
    context: RpcServerContext
  ): Promise<UpsertSocialSettingsResponse> {
    try {
      if (
        request.privateMessagesPrivacy === undefined &&
        request.blockedUsersMessagesVisibility === undefined &&
        request.showSituationReactions === undefined
      ) {
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

      const { private_messages_privacy: privacyUpdate, ...otherSettings } = dbSettings

      let settings: Awaited<ReturnType<typeof friendsDb.upsertSocialSettings>>
      if (privacyUpdate === PrivateMessagesPrivacy.ONLY_FRIENDS) {
        // Tightening must reach Gatekeeper first. If it fails, the permissive database value is
        // left untouched and the client receives an error instead of a false success.
        try {
          await commsGatekeeper.updateUserPrivateMessagePrivacyMetadata(context.address, privacyUpdate)
        } catch (error) {
          // Settings Gatekeeper has no say over are still persisted, so a co-submitted change
          // is not silently discarded along with the privacy one.
          if (Object.keys(otherSettings).length > 0) {
            await friendsDb.upsertSocialSettings(context.address, otherSettings)
          }
          throw error
        }

        settings = await friendsDb.upsertSocialSettings(context.address, dbSettings)
      } else {
        // Loosening is written locally first. If Gatekeeper then fails it retains the more
        // restrictive value, which is inconsistent but fail-closed and visible to the client.
        settings = await friendsDb.upsertSocialSettings(context.address, dbSettings)
        if (privacyUpdate !== undefined) {
          await commsGatekeeper.updateUserPrivateMessagePrivacyMetadata(context.address, privacyUpdate)
        }
      }

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
