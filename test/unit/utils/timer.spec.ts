import { sleep } from '../../../src/utils/timer'

describe('sleep', () => {
  beforeAll(() => {
    jest.useFakeTimers()
    jest.spyOn(global, 'setTimeout')
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('should call setTimeout with the correct delay and resolve', async () => {
    const sleepPromise = sleep(1000)

    jest.runAllTimers()

    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000)

    await expect(sleepPromise).resolves.toBeUndefined()
  })
})
