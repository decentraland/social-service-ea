import { AppComponents, SubscriptionContext, SubscriptionEventsEmitter } from '../../types'
import { VoiceChatStatus } from '../voice/types'

/** Recipient filters shared by every transport; serializers and profile enrichment remain transport-specific. */
export function createSubscriptionPolicies(context: SubscriptionContext) {
  return {
    friendshipUpdate: {
      getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
      shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) =>
        update.from !== context.address && update.to === context.address
    },
    friendConnectivityUpdate: {
      getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendConnectivityUpdate']) => update.address,
      shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendConnectivityUpdate']) =>
        update.address !== context.address
    },
    blockUpdate: {
      getAddressFromUpdate: (update: SubscriptionEventsEmitter['blockUpdate']) => update.blockerAddress,
      shouldHandleUpdate: (update: SubscriptionEventsEmitter['blockUpdate']) =>
        update.blockedAddress === context.address
    },
    privateVoiceChatUpdate: {
      getAddressFromUpdate: () => 'not-needed',
      shouldHandleUpdate: (update: SubscriptionEventsEmitter['privateVoiceChatUpdate']) =>
        Object.values(VoiceChatStatus).includes(update.status)
    },
    communityMemberConnectivityUpdate: {
      getAddressFromUpdate: (update: SubscriptionEventsEmitter['communityMemberConnectivityUpdate']) =>
        update.memberAddress,
      shouldHandleUpdate: () => true
    },
    communityVoiceChatUpdate: { getAddressFromUpdate: () => 'not-needed', shouldHandleUpdate: () => true }
  }
}

/** Resolve online friend addresses once; callers choose whether to enrich them with profiles. */
export async function getOnlineFriendAddresses(
  { friendsDb, peersStats }: Pick<AppComponents, 'friendsDb' | 'peersStats'>,
  address: string
): Promise<string[]> {
  const peers = await peersStats.getConnectedPeers()
  return (await friendsDb.getOnlineFriends(address, peers)).map((friend) => friend.address)
}
