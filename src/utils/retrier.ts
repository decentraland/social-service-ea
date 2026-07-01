import { sleep } from './timer'

export async function retry<T>(
  action: (attempt: number) => Promise<T>,
  retries: number = 3,
  waitTime: number = 300,
  onRetry?: (error: Error, attempt: number) => void
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await action(attempt)
    } catch (error: any) {
      if (attempt === retries) {
        throw new Error(`Failed after ${retries} attempts: ${error.message}`)
      }
      // Surface the transient failure so callers can log it — otherwise retries are silent and a
      // flaky upstream is invisible until the final attempt throws.
      onRetry?.(error, attempt)
      await sleep(waitTime)
    }
  }
  throw new Error('Unexpected error: retry loop ended without throwing')
}
