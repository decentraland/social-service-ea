import { ICommunityBroadcasterComponent } from '../../../src/logic/community'

export function createBroadcasterMockComponent({
  broadcast = jest.fn()
}: Partial<jest.Mocked<ICommunityBroadcasterComponent>>): jest.Mocked<ICommunityBroadcasterComponent> {
  return {
    broadcast
  }
}
