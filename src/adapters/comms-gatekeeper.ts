import { ICommsGatekeeperComponent, AppComponents, PrivateMessagesPrivacy, CommunityRole } from '../types'
import { CommunityVoiceChatAction, CommunityVoiceChatProfileData } from '../logic/community-voice/types'
import { CommunityVoiceChatStatus } from '../logic/community/types'
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

  /**
   * Gets credentials for a community voice chat.
   * @param communityId - The ID of the community
   * @param userAddress - The address of the user joining
   * @param userRole - The role of the user in the community (owner, moderator, member, none)
   * @param profileData - Optional profile data (name, has_claimed_name, profile_picture_url)
   * @returns Connection credentials for the user
   */
  async function getCommunityVoiceChatCredentials(
    communityId: string,
    userAddress: string,
    userRole: CommunityRole,
    profileData?: CommunityVoiceChatProfileData | null
  ): Promise<{ connectionUrl: string }> {
    try {
      const requestBody: {
        community_id: string
        user_address: string
        action: CommunityVoiceChatAction
        user_role: string
        profile_data?: CommunityVoiceChatProfileData
      } = {
        community_id: communityId,
        user_address: userAddress,
        action: CommunityVoiceChatAction.JOIN,
        user_role: userRole
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
   * @param userRole - The role of the user creating the voice chat (owner, moderator, member, none)
   * @param profileData - Optional profile data for the creator
   * @returns The connection URL for the moderator
   */
  async function createCommunityVoiceChatRoom(
    communityId: string,
    createdBy: string,
    userRole: CommunityRole,
    profileData?: CommunityVoiceChatProfileData | null
  ): Promise<{ connectionUrl: string }> {
    try {
      const requestBody: {
        community_id: string
        user_address: string
        action: CommunityVoiceChatAction
        user_role: string
        profile_data?: CommunityVoiceChatProfileData
      } = {
        community_id: communityId,
        user_address: createdBy,
        action: CommunityVoiceChatAction.CREATE,
        user_role: userRole
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
   * Ends a community voice chat room (force end regardless of participants).
   * @param communityId - The ID of the community
   * @param userAddress - The address of the user ending the room
   */
  async function endCommunityVoiceChatRoom(communityId: string, userAddress: string): Promise<void> {
    try {
      const response = await fetch(`${commsUrl}/community-voice-chat/${communityId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commsGateKeeperToken}`
        },
        body: JSON.stringify({
          user_address: userAddress
        })
      })

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }

      logger.info(`Community voice chat room ended for community ${communityId} by ${userAddress}`)
    } catch (error) {
      logger.error(
        `Failed to end community voice chat room for community ${communityId}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
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
   * Rejects a speak request in a community voice chat.
   * This sets the hand_raised metadata to false for the user.
   * @param communityId - The ID of the community
   * @param userAddress - The address of the user whose speak request is being rejected
   */
  async function rejectSpeakRequestInCommunityVoiceChat(communityId: string, userAddress: string): Promise<void> {
    try {
      const response = await fetch(
        `${commsUrl}/community-voice-chat/${communityId}/users/${userAddress}/speak-request`,
        {
          method: 'DELETE',
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
        `Failed to reject speak request for user ${userAddress} in community ${communityId}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
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
  async function getCommunityVoiceChatStatus(communityId: string): Promise<CommunityVoiceChatStatus | null> {
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
   * Gets the status of multiple community voice chats in batch.
   * @param communityIds - Array of community IDs to check
   * @returns Record mapping community IDs to their voice chat status
   */
  async function getCommunitiesVoiceChatStatus(
    communityIds: string[]
  ): Promise<Record<string, CommunityVoiceChatStatus>> {
    if (communityIds.length === 0) {
      return {}
    }

    try {
      const statuses = await Promise.all(
        communityIds.map(async (communityId) => {
          try {
            const status = await getCommunityVoiceChatStatus(communityId)
            return {
              communityId,
              status:
                status || ({ isActive: false, participantCount: 0, moderatorCount: 0 } as CommunityVoiceChatStatus)
            }
          } catch (error) {
            logger.warn(`Could not get voice chat status for community ${communityId}`, {
              error: isErrorWithMessage(error) ? error.message : 'Unknown error'
            })
            return {
              communityId,
              status: { isActive: false, participantCount: 0, moderatorCount: 0 } as CommunityVoiceChatStatus
            }
          }
        })
      )

      return statuses.reduce(
        (acc, { communityId, status }) => {
          acc[communityId] = status
          return acc
        },
        {} as Record<string, CommunityVoiceChatStatus>
      )
    } catch (error) {
      logger.error(
        `Failed to get multiple community voice chat statuses: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  /**
   * Gets all active community voice chats.
   * @returns Array of active community voice chats with status information
   */
  async function getAllActiveCommunityVoiceChats(): Promise<
    Array<{
      communityId: string
      participantCount: number
      moderatorCount: number
    }>
  > {
    try {
      const response = await fetch(`${commsUrl}/community-voice-chat/active`, {
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
      return data.data || []
    } catch (error) {
      logger.error(
        `Failed to get all active community voice chats: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
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

  /**
   * Checks if a user is currently in any community voice chat.
   * @param userAddress - The address of the user to check.
   * @returns Promise<boolean> - True if user is in a community voice chat, false otherwise.
   */
  async function isUserInCommunityVoiceChat(userAddress: string): Promise<boolean> {
    try {
      const response = await fetch(`${commsUrl}/users/${userAddress}/community-voice-chat/status`, {
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
      return data.isInCommunityVoiceChat
    } catch (error) {
      logger.error(
        `Failed to check community voice chat status for user ${userAddress}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
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
    endCommunityVoiceChatRoom,
    updateUserMetadataInCommunityVoiceChat,
    requestToSpeakInCommunityVoiceChat,
    rejectSpeakRequestInCommunityVoiceChat,
    promoteSpeakerInCommunityVoiceChat,
    demoteSpeakerInCommunityVoiceChat,
    getCommunityVoiceChatStatus,
    getCommunitiesVoiceChatStatus,
    getAllActiveCommunityVoiceChats,
    kickUserFromCommunityVoiceChat,
    isUserInCommunityVoiceChat
  }
}
