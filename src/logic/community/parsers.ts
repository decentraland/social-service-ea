import { CommunityMemberConnectivityUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { SubscriptionEventsEmitter } from '../../types'

export function parseCommunityMemberConnectivityUpdate(
  update: SubscriptionEventsEmitter['communityMemberConnectivityUpdate']
): CommunityMemberConnectivityUpdate | null {
  const { communityId, memberAddress, status } = update
  return {
    communityId,
    member: {
      address: memberAddress
    },
    status
  }
}
