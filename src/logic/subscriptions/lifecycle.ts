import { AppComponents } from '../../types'

/** Detach one connection; only the last connection ending may terminate the user's private call. */
export function detachSubscriptionConnection(
  { subscribersContext, voice }: Pick<AppComponents, 'subscribersContext' | 'voice'>,
  address: string,
  connectionId: string
): void {
  if (subscribersContext.removeConnection(address, connectionId)) {
    // Best-effort cleanup; a disconnected socket cannot receive a failure response.
    void voice.endIncomingOrOutgoingPrivateVoiceChatForUser(address).catch(() => undefined)
  }
}
