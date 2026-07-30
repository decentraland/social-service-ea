import { IPlacesApiComponent } from '../../../src/types'

export function createPlacesApiAdapterMockComponent({
  getDestinations = jest.fn()
}: Partial<jest.Mocked<IPlacesApiComponent>>): jest.Mocked<IPlacesApiComponent> {
  return {
    getDestinations
  }
}
