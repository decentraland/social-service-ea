import { ICacheComponent } from '../../../src/types'

export function createMemoryCacheMock({
  get,
  put,
  mGet
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
      }),
    mGet:
      mGet ||
      jest.fn(async (keys: string[]) => {
        return keys.map((key) => cache.get(key)).filter((value) => value !== null) as any[]
      })
  } as jest.Mocked<ICacheComponent>
}
