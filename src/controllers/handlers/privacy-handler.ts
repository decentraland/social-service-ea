import { EthAddress } from '@dcl/schemas'
import { HttpRequest, HttpResponse } from '@well-known-components/uws-http-server'
import { AppComponents, PrivateMessagesPrivacy } from '../../types'
import { isErrorWithMessage } from '../../utils/errors'

export async function createPrivacyHandler(components: Pick<AppComponents, 'db' | 'logs'>) {
  const { db, logs } = components
  const logger = logs.getLogger('privacy-handler')

  return {
    path: '/v1/users/:address/privacy-settings',
    f: async (_: HttpResponse, req: HttpRequest) => {
      const address = req.getParameter(0)?.toLowerCase()
      logger.info(`Getting privacy settings for address: ${address}`)

      if (!EthAddress.validate(address)) {
        return {
          status: 400,
          body: { error: 'Invalid address' }
        }
      }

      try {
        const settings = await db.getSocialSettings([address])

        return {
          status: 200,
          body: {
            private_messages_privacy: settings[0]?.private_messages_privacy ?? PrivateMessagesPrivacy.ALL
          }
        }
      } catch (error) {
        logger.error(
          `Error getting privacy settings for address: ${address}, error: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
        )
        return {
          status: 500,
          body: {
            error: isErrorWithMessage(error) ? error.message : 'Unknown error'
          }
        }
      }
    }
  }
}
