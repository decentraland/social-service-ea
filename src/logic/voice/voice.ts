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
    const keys = await commsGatekeeper.getPrivateVoiceChatKeys(
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
        token: keys[privateVoiceChat.caller_address],
        url: keys[privateVoiceChat.caller_address]
      }
    })

    // The call has been accepted, we can delete it from the database
    await voiceDb.deletePrivateVoiceChat(callId)

    return {
      token: keys[privateVoiceChat.callee_address],
      url: keys[privateVoiceChat.callee_address]
    }
  }

  return {
    startPrivateVoiceChat,
    acceptPrivateVoiceChat
  }
}
