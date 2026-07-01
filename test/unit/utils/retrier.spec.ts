import { retry } from '../../../src/utils/retrier'
import { sleep } from '../../../src/utils/timer'

jest.mock('../../../src/utils/timer', () => ({
  sleep: jest.fn()
}))

describe('retry', () => {
  const mockAction = jest.fn()
  const mockSleep = sleep as jest.MockedFunction<typeof sleep>

  it('should return result on the first attempt without retrying', async () => {
    mockAction.mockResolvedValue('success')

    const result = await retry(mockAction)

    expect(result).toBe('success')
    expect(mockAction).toHaveBeenCalledTimes(1)
    expect(mockSleep).not.toHaveBeenCalled()
  })

  it('should retry the action and succeed after a few attempts', async () => {
    mockAction
      .mockRejectedValueOnce(new Error('Failure on first try'))
      .mockRejectedValueOnce(new Error('Failure on second try'))
      .mockResolvedValueOnce('success on third try')

    const result = await retry(mockAction, 3, 100)

    expect(result).toBe('success on third try')
    expect(mockAction).toHaveBeenCalledTimes(3)
    expect(mockSleep).toHaveBeenCalledTimes(2)
    expect(mockSleep).toHaveBeenCalledWith(100)
  })

  it('should throw an error after exhausting all retries', async () => {
    mockAction.mockRejectedValue(new Error('Fail on every attempt'))

    await expect(retry(mockAction, 3, 100)).rejects.toThrowError('Failed after 3 attempts')

    expect(mockAction).toHaveBeenCalledTimes(3)
    expect(mockSleep).toHaveBeenCalledTimes(2)
  })

  it('should call sleep between retries', async () => {
    mockAction.mockRejectedValueOnce(new Error('Fail')).mockResolvedValueOnce('success after sleep')

    const result = await retry(mockAction, 2, 200)

    expect(result).toBe('success after sleep')
    expect(mockAction).toHaveBeenCalledTimes(2)
    expect(mockSleep).toHaveBeenCalledWith(200)
  })

  it('should retry with custom retry count and wait time', async () => {
    mockAction
      .mockRejectedValueOnce(new Error('Fail'))
      .mockRejectedValueOnce(new Error('Fail again'))
      .mockResolvedValueOnce('success finally')

    const result = await retry(mockAction, 5, 500)

    expect(result).toBe('success finally')
    expect(mockAction).toHaveBeenCalledTimes(3)
    expect(mockSleep).toHaveBeenCalledTimes(2)
    expect(mockSleep).toHaveBeenCalledWith(500)
  })

  it('should invoke onRetry with the error and attempt number on each retried failure', async () => {
    mockAction.mockReset()
    const firstError = new Error('fail 1')
    const secondError = new Error('fail 2')
    mockAction.mockRejectedValueOnce(firstError).mockRejectedValueOnce(secondError).mockResolvedValueOnce('ok')
    const onRetry = jest.fn()

    const result = await retry(mockAction, 3, 100, onRetry)

    expect(result).toBe('ok')
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenNthCalledWith(1, firstError, 1)
    expect(onRetry).toHaveBeenNthCalledWith(2, secondError, 2)
  })

  it('should not invoke onRetry on the final exhausting attempt', async () => {
    mockAction.mockReset()
    mockAction.mockRejectedValue(new Error('always fails'))
    const onRetry = jest.fn()

    await expect(retry(mockAction, 2, 100, onRetry)).rejects.toThrow('Failed after 2 attempts')

    // With 2 attempts only the first failure is a "retry"; the last one throws instead.
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
