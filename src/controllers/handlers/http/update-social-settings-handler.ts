import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import {
  convertDBSettingsToHTTPSettings,
  convertHTTPSettingsIntoDBSettings,
  HTTPSocialSettings
} from '../../../logic/settings'
import { UpdateSocialSettingsRequestBody } from './schemas'

export async function updateSocialSettingsHandler(
  context: Pick<
    HandlerContextWithPath<'settings' | 'logs', '/v1/social-settings'>,
    'components' | 'request' | 'verification'
  >
): Promise<HTTPResponse<HTTPSocialSettings>> {
  const {
    components: { settings, logs },
    request,
    verification
  } = context

  const logger = logs.getLogger('update-social-settings-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    const body: UpdateSocialSettingsRequestBody = await request.json()
    const updatedSettings = await settings.updateUserSettings(userAddress, convertHTTPSettingsIntoDBSettings(body))

    return {
      status: 200,
      body: {
        data: convertDBSettingsToHTTPSettings(updatedSettings)
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error updating social settings of ${userAddress}, error: ${message}`)

    throw error
  }
}
