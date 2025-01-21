import { IFetchComponent } from '@well-known-components/interfaces'

export const mockFetcher: jest.Mocked<IFetchComponent> = {
  fetch: jest.fn()
}
