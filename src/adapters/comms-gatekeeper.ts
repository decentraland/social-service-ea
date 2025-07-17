import { ICommsGatekeeperComponent, AppComponents, PrivateMessagesPrivacy } from '../types'
import { isErrorWithMessage } from '../utils/errors'
import { CommunityVoiceChatAction } from '../types/community-voice'

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

  /**
   * Gets credentials for a community voice chat.
   * @param communityId - The ID of the community
   * @param userAddress - The address of the user joining
   * @param profileData - Optional profile data (name, hasClaimedName, profilePictureUrl)
   * @returns Connection credentials for the user
   */
  async function getCommunityVoiceChatCredentials(
    communityId: string,
    userAddress: string,
    profileData?: { name: string; hasClaimedName: boolean; profilePictureUrl: string } | null
  ): Promise<{ connectionUrl: string }> {
    try {
      const requestBody: any = {
        community_id: communityId,
        user_address: userAddress,
        action: CommunityVoiceChatAction.JOIN
      }

      if (profileData) {
        requestBody.profile_data = profileData
      }

      const response = await fetch(`${commsUrl}/community-voice-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commsGateKeeperToken}`
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }

      const data = await response.json()
      return { connectionUrl: data.connection_url }
    } catch (error) {
      logger.error(
        `Failed to get community voice chat credentials for user ${userAddress} in community ${communityId}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  /**
   * Creates a community voice chat room.
   * @param communityId - The ID of the community
   * @param createdBy - The address of the moderator creating the voice chat
   * @param profileData - Optional profile data for the creator
   * @returns The connection URL for the moderator
   */
  async function createCommunityVoiceChatRoom(
    communityId: string,
    createdBy: string,
    profileData?: { name: string; hasClaimedName: boolean; profilePictureUrl: string } | null
  ): Promise<{ connectionUrl: string }> {
    try {
      const requestBody: {
        community_id: string
        user_address: string
        action: CommunityVoiceChatAction
        profile_data?: { name: string; hasClaimedName: boolean; profilePictureUrl: string }
      } = {
        community_id: communityId,
        user_address: createdBy,
        action: CommunityVoiceChatAction.CREATE
      }

      if (profileData) {
        requestBody.profile_data = profileData
      }

      const response = await fetch(`${commsUrl}/community-voice-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commsGateKeeperToken}`
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }

      const data = await response.json()
      return { connectionUrl: data.connection_url }
    } catch (error) {
      logger.error(
        `Failed to create community voice chat room for community ${communityId}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  /**
   * Sends a request to speak in a community voice chat.
   * @param communityId - The ID of the community
   * @param userAddress - The address of the user requesting to speak
   */
  async function requestToSpeakInCommunityVoiceChat(communityId: string, userAddress: string): Promise<void> {
    try {
      const response = await fetch(
        `${commsUrl}/community-voice-chat/${communityId}/users/${userAddress}/speak-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${commsGateKeeperToken}`
          }
        }
      )

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }
    } catch (error) {
      logger.error(
        `Failed to request to speak for user ${userAddress} in community ${communityId}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  /**
   * Promotes a user to speaker in a community voice chat.
   * @param communityId - The ID of the community
   * @param userAddress - The address of the user to promote
   */
  async function promoteSpeakerInCommunityVoiceChat(communityId: string, userAddress: string): Promise<void> {
    try {
      const response = await fetch(`${commsUrl}/community-voice-chat/${communityId}/users/${userAddress}/speaker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commsGateKeeperToken}`
        }
      })

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }
    } catch (error) {
      logger.error(
        `Failed to promote speaker for user ${userAddress} in community ${communityId}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  /**
   * Demotes a user to listener in a community voice chat.
   * @param communityId - The ID of the community
   * @param userAddress - The address of the user to demote
   */
  async function demoteSpeakerInCommunityVoiceChat(communityId: string, userAddress: string): Promise<void> {
    try {
      const response = await fetch(`${commsUrl}/community-voice-chat/${communityId}/users/${userAddress}/speaker`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commsGateKeeperToken}`
        }
      })

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }
    } catch (error) {
      logger.error(
        `Failed to demote speaker for user ${userAddress} in community ${communityId}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  /**
   * Updates user metadata in a community voice chat (legacy method for backward compatibility).
   * @param communityId - The ID of the community
   * @param userAddress - The address of the user to update
   * @param metadata - The metadata to update
   */
  async function updateUserMetadataInCommunityVoiceChat(
    communityId: string,
    userAddress: string,
    metadata: { isRequestingToSpeak?: boolean; canPublishTracks?: boolean }
  ): Promise<void> {
    // Use the specific methods based on metadata
    if (metadata.isRequestingToSpeak === true) {
      return requestToSpeakInCommunityVoiceChat(communityId, userAddress)
    } else if (metadata.canPublishTracks === true && metadata.isRequestingToSpeak === false) {
      return promoteSpeakerInCommunityVoiceChat(communityId, userAddress)
    } else if (metadata.canPublishTracks === false && metadata.isRequestingToSpeak === false) {
      return demoteSpeakerInCommunityVoiceChat(communityId, userAddress)
    }

    throw new Error('Unsupported metadata combination')
  }

  /**
   * Gets the status of a community voice chat.
   * @param communityId - The ID of the community
   * @returns The community voice chat status or null if not active
   */
  async function getCommunityVoiceChatStatus(communityId: string): Promise<{
    isActive: boolean
    participantCount: number
    moderatorCount: number
  } | null> {
    try {
      const response = await fetch(`${commsUrl}/community-voice-chat/${communityId}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commsGateKeeperToken}`
        }
      })

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }

      const data = await response.json()
      return {
        isActive: data.active,
        participantCount: data.participant_count,
        moderatorCount: data.moderator_count
      }
    } catch (error) {
      logger.error(
        `Failed to get community voice chat status for community ${communityId}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  /**
   * Kicks a user from a community voice chat.
   * @param communityId - The ID of the community
   * @param userAddress - The address of the user to kick
   */
  async function kickUserFromCommunityVoiceChat(communityId: string, userAddress: string): Promise<void> {
    try {
      const response = await fetch(`${commsUrl}/community-voice-chat/${communityId}/users/${userAddress}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commsGateKeeperToken}`
        }
      })

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }
    } catch (error) {
      logger.error(
        `Failed to kick user from community voice chat for user ${userAddress} in community ${communityId}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  return {
    endPrivateVoiceChat,
    updateUserPrivateMessagePrivacyMetadata,
    isUserInAVoiceChat,
    getPrivateVoiceChatCredentials,
    getCommunityVoiceChatCredentials,
    createCommunityVoiceChatRoom,
    updateUserMetadataInCommunityVoiceChat,
    requestToSpeakInCommunityVoiceChat,
    promoteSpeakerInCommunityVoiceChat,
    demoteSpeakerInCommunityVoiceChat,
    getCommunityVoiceChatStatus,
    kickUserFromCommunityVoiceChat
  }
}
