import { IFetchComponent } from '@dcl/core-commons'

export const mockFetcher: jest.Mocked<IFetchComponent> = {
  fetch: jest.fn()
}
