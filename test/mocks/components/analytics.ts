import { IAnalyticsComponent } from '@dcl/analytics-component'

export function createMockedAnalyticsComponent({
  sendEvent = jest.fn(),
  fireEvent = jest.fn()
}: Partial<jest.Mocked<IAnalyticsComponent>>): jest.Mocked<IAnalyticsComponent> {
  return {
    sendEvent,
    fireEvent
  }
}
