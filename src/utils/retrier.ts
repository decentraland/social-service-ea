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
        throw new Error(`Failed after ${retries} attempts: ${error.message}`)
      }
      await sleep(waitTime)
    }
  }
  throw new Error('Unexpected error: retry loop ended without throwing')
}
