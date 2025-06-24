import { IPlacesApiComponent } from '../../../src/types'

export function createPlacesApiAdapterMockComponent({
  getPlaces = jest.fn()
}: Partial<jest.Mocked<IPlacesApiComponent>>): jest.Mocked<IPlacesApiComponent> {
  return {
    getPlaces
  }
}
