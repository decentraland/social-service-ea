import { IUpdateHandlerComponent } from '../../../src/types/components'

export function createMockUpdateHandlerComponent({
  friendshipUpdateHandler = jest.fn(),
  friendshipAcceptedUpdateHandler = jest.fn(),
  friendConnectivityUpdateHandler = jest.fn(),
  communityMemberConnectivityUpdateHandler = jest.fn(),
  blockUpdateHandler = jest.fn(),
  privateVoiceChatUpdateHandler = jest.fn(),
  communityMemberStatusHandler = jest.fn(),
  handleSubscriptionUpdates = jest.fn(),
  communityVoiceChatUpdateHandler = jest.fn(),
  communityDeletedUpdateHandler = jest.fn()
}: Partial<jest.Mocked<IUpdateHandlerComponent>>): jest.Mocked<IUpdateHandlerComponent> {
  return {
    friendshipUpdateHandler,
    friendshipAcceptedUpdateHandler,
    friendConnectivityUpdateHandler,
    communityMemberConnectivityUpdateHandler,
    blockUpdateHandler,
    privateVoiceChatUpdateHandler,
    communityMemberStatusHandler,
    handleSubscriptionUpdates,
    communityVoiceChatUpdateHandler,
    communityDeletedUpdateHandler
  }
}
