import { AppComponents, PrivateMessagesPrivacy } from '../../types'
import { UsersAlreadyInVoiceChatError, VoiceCallNotAllowedError } from './errors'
import { IVoiceComponent } from './types'

export async function createVoiceComponent({
  logs,
  settings,
  commsGatekeeper,
  voiceDb,
  friendsDb,
  pubsub
}: Pick<
  AppComponents,
  'logs' | 'settings' | 'commsGatekeeper' | 'voiceDb' | 'friendsDb' | 'pubsub'
>): Promise<IVoiceComponent> {
  const logger = logs.getLogger('voice')

  async function startVoiceChat(callerAddress: string, calleeAddress: string): Promise<string> {
    logger.info(`Starting voice chat for call ${callerAddress} -> ${calleeAddress}`)

    // Check privacy settings of the callee and the caller
    const [calleeSettings, callerSettings] = await settings.getUsersSettings([calleeAddress, callerAddress])
    if (
      calleeSettings.private_messages_privacy !== PrivateMessagesPrivacy.ALL ||
      callerSettings.private_messages_privacy !== PrivateMessagesPrivacy.ALL
    ) {
      // If the callee or the caller are only accepting voice calls from friends, we need to check if they are friends
      const friendshipStatus = await friendsDb.getFriendship([callerAddress, calleeAddress])
      if (!friendshipStatus?.is_active) {
        throw new VoiceCallNotAllowedError()
      }
    }

    // Check if the callee or the caller are calling someone else
    const areUsersCallingSomeoneElse = await voiceDb.areUsersBeingCalledOrCallingSomeone([callerAddress, calleeAddress])
    if (areUsersCallingSomeoneElse) {
      throw new VoiceCallNotAllowedError()
    }

    // Check if the callee or the caller are in a voice chat
    const [isCalleeInAVoiceChat, isCallerInAVoiceChat] = await Promise.all([
      commsGatekeeper.isUserInAVoiceChat(callerAddress),
      commsGatekeeper.isUserInAVoiceChat(calleeAddress)
    ])

    if (isCalleeInAVoiceChat || isCallerInAVoiceChat) {
      throw new UsersAlreadyInVoiceChatError()
    }

    // Records the call intent in the database
    const callId = await voiceDb.createCall(callerAddress, calleeAddress)

    // Send the call to the callee
    await pubsub.publishInChannel('voice-call', {
      callId,
      callerAddress,
      calleeAddress,
      status: 'requested'
    })

    return callId
  }

  return {
    startVoiceChat
  }
}
