import { PrivateVoiceChatNotFoundError } from '../../adapters/comms-gatekeeper'
import { PRIVATE_VOICE_CHAT_UPDATES_CHANNEL } from '../../adapters/pubsub'
import { AppComponents, PrivateMessagesPrivacy } from '../../types'
import {
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

    // Notify the other user about the voice call being accepted
    await pubsub.publishInChannel(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
      callId,
      callerAddress: privateVoiceChat.caller_address,
      calleeAddress: privateVoiceChat.callee_address,
      status: VoiceChatStatus.ACCEPTED,
      // Credentials for the caller
      credentials: {
        token: credentials[privateVoiceChat.caller_address].token,
        url: credentials[privateVoiceChat.caller_address].url
      }
    })

    // The call has been accepted, we can delete it from the database
    await voiceDb.deletePrivateVoiceChat(callId)

    return {
      token: credentials[privateVoiceChat.callee_address].token,
      url: credentials[privateVoiceChat.callee_address].url
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

    await pubsub.publishInChannel(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
      callId,
      callerAddress: privateVoiceChat.caller_address,
      calleeAddress: privateVoiceChat.callee_address,
      status: VoiceChatStatus.REJECTED
    })

    await voiceDb.deletePrivateVoiceChat(callId)
  }

  async function endPrivateVoiceChat(callId: string, address: string): Promise<void> {
    logger.info(`Ending voice chat for call ${callId}`)

    // If the voice chat is in the database, we can delete it
    const privateVoiceChat = await voiceDb.getPrivateVoiceChat(callId)
    if (privateVoiceChat) {
      // If the caller or the callee are not the ones ending the call, we don't do anything
      if (privateVoiceChat.callee_address !== address && privateVoiceChat.caller_address !== address) {
        logger.info(`The caller or the callee are not the ones ending the call (${address}) with id ${callId}`)
        return
      }

      // Delete the voice chat from the database
      await voiceDb.deletePrivateVoiceChat(callId)

      // Notify the other user that the call ended
      await pubsub.publishInChannel(PRIVATE_VOICE_CHAT_UPDATES_CHANNEL, {
        callId,
        calleeAddress: address === privateVoiceChat.callee_address ? undefined : privateVoiceChat.callee_address,
        callerAddress: address === privateVoiceChat.caller_address ? undefined : privateVoiceChat.caller_address,
        status: VoiceChatStatus.ENDED
      })
    } else {
      // If the voice chat is not in the database, we need to notify the comms gatekeeper that the call has ended
      await commsGatekeeper.endPrivateVoiceChat(callId, address)
    }
  }

  return {
    endPrivateVoiceChat,
    rejectPrivateVoiceChat,
    startPrivateVoiceChat,
    acceptPrivateVoiceChat
  }
}
