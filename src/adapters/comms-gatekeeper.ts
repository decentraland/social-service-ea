import { AppComponents, ICommsGatekeeperComponent, PrivateMessagesPrivacy } from '../types'
import { isErrorWithMessage } from '../utils/errors'

export const createCommsGatekeeperComponent = async ({
  logs,
  config,
  fetcher
}: Pick<AppComponents, 'logs' | 'config' | 'fetcher'>): Promise<ICommsGatekeeperComponent> => {
  const { fetch } = fetcher
  const logger = logs.getLogger('comms-gatekeeper-component')
  const commsUrl = await config.requireString('COMMS_URL')
  const commsGateKeeperToken = await config.requireString('COMMS_GATEKEEPER_AUTH_TOKEN')

  /**
   * Updates the private message privacy metadata for a user.
   * @param address - The address of the user to update
   * @param privateMessagesPrivacy - The new private message privacy setting
   */
  async function updateUserPrivateMessagePrivacyMetadata(
    address: string,
    privateMessagesPrivacy: PrivateMessagesPrivacy
  ) {
    try {
      const response = await fetch(`${commsUrl}/users/${address}/private-messages-privacy`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commsGateKeeperToken}`
        },
        body: JSON.stringify({
          privateMessagesPrivacy
        })
      })

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }
      logger.info(`Updated user private message privacy metadata for user ${address} to ${privateMessagesPrivacy}`)
    } catch (error) {
      logger.error(
        `Failed to update user private message privacy metadata for user ${address}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  return {
    updateUserPrivateMessagePrivacyMetadata
  }
}
