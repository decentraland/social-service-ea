import { AppComponents, ICommsGatekeeperComponent, PrivateMessagesPrivacy } from '../types'
import { isErrorWithMessage } from '../utils/errors'

export class PrivateVoiceChatNotFoundError extends Error {
  constructor(callId: string) {
    super(`Voice chat for call ${callId} not found`)
  }
}

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
  ): Promise<void> {
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
      return Boolean(data.is_user_in_voice_chat)
    } catch (error) {
      logger.error(
        `Failed to check if user ${address} is in a voice chat: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  async function getPrivateVoiceChatCredentials(
    roomId: string,
    calleeAddress: string,
    callerAddress: string
  ): Promise<Record<string, { connectionUrl: string }>> {
    try {
      const response = await fetch(`${commsUrl}/private-voice-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commsGateKeeperToken}`
        },
        body: JSON.stringify({
          room_id: roomId,
          user_addresses: [calleeAddress, callerAddress]
        })
      })

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }

      const body = (await response.json()) as Record<string, { connection_url: string }>

      return Object.entries(body).reduce(
        (acc, [address, { connection_url }]) => {
          // Convert the connection_url to camel case
          acc[address] = { connectionUrl: connection_url }
          return acc
        },
        {} as Record<string, { connectionUrl: string }>
      )
    } catch (error) {
      logger.error(
        `Failed to get private voice chat keys for user ${calleeAddress} and ${callerAddress}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  /**
   * Ends a private voice chat for a given call ID and address.
   * @param callId - The ID of the voice chat to end
   * @param address - The address of the user ending the voice chat
   * @returns The addresses of the users in the ended voice chat.
   */
  async function endPrivateVoiceChat(callId: string, address: string): Promise<string[]> {
    let usersInVoiceChat: string[] = []
    try {
      const response = await fetch(`${commsUrl}/private-voice-chat/${callId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commsGateKeeperToken}`
        },
        body: JSON.stringify({
          address
        })
      })

      if (response.ok) {
        const data = await response.json()
        usersInVoiceChat = data.users_in_voice_chat
      }
    } catch (error) {
      logger.error(
        `Failed to end private voice chat for call ${callId} and address ${address}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
    return usersInVoiceChat
  }

  return {
    endPrivateVoiceChat,
    updateUserPrivateMessagePrivacyMetadata,
    isUserInAVoiceChat,
    getPrivateVoiceChatCredentials
  }
}
