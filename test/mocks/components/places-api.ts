import { IPlacesApiComponent } from '../../../src/types'

export function createPlacesApiAdapterMockComponent(): IPlacesApiComponent {
  return {
    getPlaces: jest.fn().mockResolvedValue([])
  }
}
