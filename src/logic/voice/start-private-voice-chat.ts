import { AppComponents } from '../../types'
import { UserInCommunityVoiceChatError } from './errors'

/**
 * Starts a private voice chat unless the caller or the callee is in a community voice chat. Every
 * transport (RPC and HTTP) calls this, so the rule lives in one place.
 *
 * @returns The id of the new call.
 */
export async function startPrivateVoiceChat(
  { voice, commsGatekeeper }: Pick<AppComponents, 'voice' | 'commsGatekeeper'>,
  callerAddress: string,
  calleeAddress: string
): Promise<string> {
  const [isCallerInCommunityCall, isCalleeInCommunityCall] = await Promise.all([
    commsGatekeeper.isUserInCommunityVoiceChat(callerAddress),
    commsGatekeeper.isUserInCommunityVoiceChat(calleeAddress)
  ])

  if (isCallerInCommunityCall || isCalleeInCommunityCall) {
    throw new UserInCommunityVoiceChatError(isCallerInCommunityCall)
  }

  return voice.startPrivateVoiceChat(callerAddress, calleeAddress)
}
