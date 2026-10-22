import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { convertDBSettingsToHTTPSettings, HTTPSocialSettings } from '../../../logic/settings'

export async function getSocialSettingsHandler(
  context: Pick<HandlerContextWithPath<'settings' | 'logs', '/v1/social-settings'>, 'components' | 'verification'>
): Promise<HTTPResponse<HTTPSocialSettings>> {
  const {
    components: { settings, logs },
    verification
  } = context

  const logger = logs.getLogger('get-social-settings-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    const [userSettings] = await settings.getUsersSettings([userAddress])

    return {
      status: 200,
      body: {
        data: convertDBSettingsToHTTPSettings(userSettings)
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting social settings of ${userAddress}, error: ${message}`)

    throw error
  }
}
