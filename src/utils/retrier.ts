import { sleep } from './timer'

export async function retry<T>(
  action: (attempt: number) => Promise<T>,
  retries: number = 3,
  waitTime: number = 300
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await action(attempt)
    } catch (error: any) {
      if (attempt === retries) {
        // Preserve the original error's type and stack so callers can discriminate (instanceof).
        throw error
      }
      await sleep(waitTime)
    }
  }
  throw new Error('Unexpected error: retry loop ended without throwing')
}
