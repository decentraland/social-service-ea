import { AppComponents, ICommsGatekeeperComponent, PrivateMessagesPrivacy } from '../types'
import { isErrorWithMessage } from '../utils/errors'

export const createCommsGatekeeperComponent = async ({
  logs,
  config,
  fetcher
}: Pick<AppComponents, 'logs' | 'config' | 'fetcher'>): Promise<ICommsGatekeeperComponent> => {
  const { fetch } = fetcher
  const logger = logs.getLogger('comms-gatekeeper-component')
  const commsUrl = await config.requireString('COMMS_GATEKEEPER_URL')
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
          private_messages_privacy: privateMessagesPrivacy
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

  async function isUserInAVoiceChat(address: string): Promise<boolean> {
    try {
      const response = await fetch(`${commsUrl}/users/${address}/voice-chat-status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commsGateKeeperToken}`
        }
      })

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }

      const data = await response.json()
      return data.is_in_a_voice_chat
    } catch (error) {
      logger.error(
        `Failed to check if user ${address} is in a voice chat: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  async function getPrivateVoiceChatKeys(
    roomId: string,
    calleeAddress: string,
    callerAddress: string
  ): Promise<Record<string, string>> {
    try {
      const response = await fetch(`${commsUrl}/private-voice-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomId,
          userAddresses: [calleeAddress, callerAddress]
        })
      })

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }

      try {
        const data = await response.json()
        return data.keys
      } catch (error) {
        throw new Error(
          `Failed to parse response from server: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
        )
      }
    } catch (error) {
      logger.error(
        `Failed to get private voice chat keys for user ${calleeAddress} and ${callerAddress}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  return {
    updateUserPrivateMessagePrivacyMetadata,
    isUserInAVoiceChat,
    getPrivateVoiceChatKeys
  }
}
