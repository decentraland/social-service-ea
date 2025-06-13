import { PRIVATE_VOICE_CHAT_UPDATES_CHANNEL } from '../../adapters/pubsub'
import { AppComponents, PrivateMessagesPrivacy, PrivateVoiceChat } from '../../types'
import { isErrorWithMessage } from '../../utils/errors'
import {
  IncomingVoiceChatNotFoundError,
  UserAlreadyInVoiceChatError,
  UsersAreCallingSomeoneElseError,
  VoiceChatExpiredError,
  VoiceChatNotAllowedError,
  VoiceChatNotFoundError
} from './errors'
import { AcceptPrivateVoiceChatResult, IVoiceComponent, VoiceChatStatus } from './types'

export function createVoiceComponent({
  logs,
  settings,
  commsGatekeeper,
  voiceDb,
  friendsDb,
  pubsub
}: Pick<AppComponents, 'logs' | 'settings' | 'commsGatekeeper' | 'voiceDb' | 'friendsDb' | 'pubsub'>): IVoiceComponent {
  const logger = logs.getLogger('voice-logic')

  async function startPrivateVoiceChat(callerAddress: string, calleeAddress: string): Promise<string> {
    logger.info(`Starting private voice chat from ${callerAddress} to ${calleeAddress}`)

    // Check privacy settings of the callee and the caller
    const [calleeSettings, callerSettings] = await settings.getUsersSettings([calleeAddress, callerAddress])
    if (
      calleeSettings.private_messages_privacy !== PrivateMessagesPrivacy.ALL ||
      callerSettings.private_messages_privacy !== PrivateMessagesPrivacy.ALL
    ) {
      // If the callee or the caller are only accepting voice calls from friends, we need to check if they are friends
      const friendshipStatus = await friendsDb.getFriendship([callerAddress, calleeAddress])
      if (!friendshipStatus?.is_active) {
        throw new VoiceChatNotAllowedError()
      }
    }

    // Check if the callee or the caller are calling someone else
    const areUsersCallingSomeoneElse = await voiceDb.areUsersBeingCalledOrCallingSomeone([callerAddress, calleeAddress])
    if (areUsersCallingSomeoneElse) {
      throw new UsersAreCallingSomeoneElseError()
    }

    // Check if the callee or the caller are in a voice chat
    const [isCallerInAVoiceChat, isCalleeInAVoiceChat] = await Promise.all([
      commsGatekeeper.isUserInAVoiceChat(callerAddress),
      commsGatekeeper.isUserInAVoiceChat(calleeAddress)
    ])

    if (isCalleeInAVoiceChat) {
      throw new UserAlreadyInVoiceChatError(calleeAddress)
    } else if (isCallerInAVoiceChat) {
      throw new UserAlreadyInVoiceChatError(callerAddress)
    }

    // Records the call intent in the database
    const callId = await voiceDb.createPrivateVoiceChat(callerAddress, calleeAddress)

    // Send the call to the callee
    await pubsub.publishInChannel(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
      callId,
      callerAddress,
      calleeAddress,
      status: VoiceChatStatus.REQUESTED
    })

    return callId
  }

  async function acceptPrivateVoiceChat(callId: string, calleeAddress: string): Promise<AcceptPrivateVoiceChatResult> {
    logger.info(`Accepting voice chat for call ${callId}`)

    const privateVoiceChat = await voiceDb.getPrivateVoiceChat(callId)
    if (!privateVoiceChat) {
      throw new VoiceChatNotFoundError(callId)
    }

    if (privateVoiceChat.callee_address !== calleeAddress) {
      throw new VoiceChatNotAllowedError()
    }

    if (privateVoiceChat.expires_at < new Date()) {
      throw new VoiceChatExpiredError(callId)
    }

    // Call the comms gate-keeper endpoint to get the keys of both users
    const credentials = await commsGatekeeper.getPrivateVoiceChatCredentials(
      callId,
      privateVoiceChat.callee_address,
      privateVoiceChat.caller_address
    )

    // The call has been accepted, we can delete it from the database
    const deletedVoiceChat = await voiceDb.deletePrivateVoiceChat(callId)

    // In order to avoid race conditions, we need to check if the voice chat was deleted from the database
    if (deletedVoiceChat) {
      // Notify the other user about the voice call being accepted
      await pubsub.publishInChannel(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
        callId,
        callerAddress: privateVoiceChat.caller_address,
        calleeAddress: privateVoiceChat.callee_address,
        status: VoiceChatStatus.ACCEPTED,
        // Credentials for the caller
        credentials: {
          connectionUrl: credentials[privateVoiceChat.caller_address].connectionUrl
        }
      })

      return {
        connectionUrl: credentials[privateVoiceChat.callee_address].connectionUrl
      }
    } else {
      // If the voice chat was not deleted from the database, it means that the call was rejected by the callee
      // We need to notify the comms gatekeeper that the call has ended (reverting the call intent)
      await commsGatekeeper.endPrivateVoiceChat(callId, calleeAddress)
      throw new VoiceChatNotFoundError(callId)
    }
  }

  async function rejectPrivateVoiceChat(callId: string, calleeAddress: string): Promise<void> {
    logger.info(`Rejecting voice chat for call ${callId}`)

    const privateVoiceChat = await voiceDb.getPrivateVoiceChat(callId)
    if (!privateVoiceChat || privateVoiceChat.callee_address !== calleeAddress) {
      throw new VoiceChatNotFoundError(callId)
    }

    if (privateVoiceChat.expires_at < new Date()) {
      throw new VoiceChatExpiredError(callId)
    }

    // Delete the voice chat from the database
    const deletedVoiceChat = await voiceDb.deletePrivateVoiceChat(callId)

    // In order to avoid race conditions, we need to check if the voice chat was deleted from the database
    if (deletedVoiceChat) {
      // Notify the other user that the call was rejected
      await pubsub.publishInChannel(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
        callId,
        callerAddress: privateVoiceChat.caller_address,
        calleeAddress: privateVoiceChat.callee_address,
        status: VoiceChatStatus.REJECTED
      })
    } else {
      // If the voice chat was not deleted from the database, it means that the operation was not successful
      // We need to notify the user that rejected the call
      throw new VoiceChatNotFoundError(callId)
    }
  }

  async function endPrivateVoiceChat(callId: string, address: string): Promise<void> {
    logger.info(`Ending voice chat for call ${callId}`)

    // If the voice chat is in the database, we can delete it
    const privateVoiceChat = await voiceDb.getPrivateVoiceChat(callId)
    if (privateVoiceChat) {
      // If the caller or the callee are not the ones ending the call, we don't do anything
      if (privateVoiceChat.callee_address !== address && privateVoiceChat.caller_address !== address) {
        logger.info(`The caller or the callee are not the ones ending the call (${address}) with id ${callId}`)
        throw new VoiceChatNotFoundError(callId)
      }

      // Delete the voice chat from the database
      const deletedVoiceChat = await voiceDb.deletePrivateVoiceChat(callId)

      // In order to avoid race conditions, we need to check if the voice chat was deleted from the database
      if (deletedVoiceChat) {
        // Notify the other user that the call ended
        return pubsub.publishInChannel(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
          callId,
          // Set the callee or the caller address to undefined if they are the ones ending the call
          calleeAddress: address === privateVoiceChat.callee_address ? undefined : privateVoiceChat.callee_address,
          callerAddress: address === privateVoiceChat.caller_address ? undefined : privateVoiceChat.caller_address,
          status: VoiceChatStatus.ENDED
        })
      }
    }

    // If the voice chat was not deleted or was not found, we need to try and end it in the comms gatekeeper
    const usersInVoiceChat = await commsGatekeeper.endPrivateVoiceChat(callId, address)

    // If the voice chat was not ended, it means that the call was never accepted
    if (usersInVoiceChat.length === 0) {
      throw new VoiceChatNotFoundError(callId)
    }

    // Notify the other user that the call ended
    await pubsub.publishInChannel(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
      callId,
      // Set the caller address to the other user in the voice chat
      // We don't know if it's the callee or the caller, but the event handler will resolve it
      callerAddress: usersInVoiceChat.find((user) => user !== address),
      status: VoiceChatStatus.ENDED
    })
  }

  /**
   * Gets the incoming private voice chat for a given address.
   * @param address - The address of the user to get the incoming private voice chat for.
   * @returns The incoming private voice chat.
   */
  async function getIncomingPrivateVoiceChat(address: string): Promise<PrivateVoiceChat> {
    logger.info(`Getting incoming private voice chats for ${address}`)

    const privateVoiceChat = await voiceDb.getPrivateVoiceChatForCalleeAddress(address)
    if (!privateVoiceChat || privateVoiceChat.expires_at < new Date()) {
      throw new IncomingVoiceChatNotFoundError(address)
    }
    return privateVoiceChat
  }

  /**
   * Ends all private voice chat for a given address.
   * @param address - The address of the user to end the private voice chats for.
   */
  async function endIncomingOrOutgoingPrivateVoiceChatForUser(address: string): Promise<void> {
    logger.info(`Ending all private voice chats for ${address}`)

    try {
      const privateVoiceChat = await voiceDb.getPrivateVoiceChatOfUser(address)
      if (privateVoiceChat) {
        await endPrivateVoiceChat(privateVoiceChat.id, privateVoiceChat.callee_address)
      }
    } catch (error) {
      logger.error(
        `Error ending private voice chats for ${address}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
    }
  }

  return {
    endIncomingOrOutgoingPrivateVoiceChatForUser,
    endPrivateVoiceChat,
    getIncomingPrivateVoiceChat,
    rejectPrivateVoiceChat,
    startPrivateVoiceChat,
    acceptPrivateVoiceChat
  }
}
