import { IUpdateHandlerComponent } from '../../../src/types/components'

export function createMockUpdateHandlerComponent({
  friendshipUpdateHandler = jest.fn(),
  friendshipAcceptedUpdateHandler = jest.fn(),
  friendConnectivityUpdateHandler = jest.fn(),
  communityMemberConnectivityUpdateHandler = jest.fn(),
  blockUpdateHandler = jest.fn(),
  privateVoiceChatUpdateHandler = jest.fn(),
  communityMemberJoinHandler = jest.fn(),
  communityMemberLeaveHandler = jest.fn(),
  handleSubscriptionUpdates = jest.fn()
}: Partial<jest.Mocked<IUpdateHandlerComponent>>): jest.Mocked<IUpdateHandlerComponent> {
  return {
    friendshipUpdateHandler,
    friendshipAcceptedUpdateHandler,
    friendConnectivityUpdateHandler,
    communityMemberConnectivityUpdateHandler,
    blockUpdateHandler,
    privateVoiceChatUpdateHandler,
    communityMemberJoinHandler,
    communityMemberLeaveHandler,
    handleSubscriptionUpdates
  }
}
