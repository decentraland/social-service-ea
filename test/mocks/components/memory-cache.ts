import { ICacheComponent } from '../../../src/types'

export function createMemoryCacheMock({
  get,
  put
}: Partial<jest.Mocked<ICacheComponent>>): jest.Mocked<ICacheComponent> {
  const cache = new Map<string, any>()

  return {
    get:
      get ||
      jest.fn(async (key: string) => {
        return cache.get(key) || null
      }),
    put:
      put ||
      jest.fn(async (key: string, value: any) => {
        cache.set(key, value)
      })
  } as jest.Mocked<ICacheComponent>
}
