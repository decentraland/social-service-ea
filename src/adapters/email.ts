import { AppComponents, IEmailComponent } from '../types'
import { fetchVoid } from '../utils/fetch'

export async function createEmailComponent(
  components: Pick<AppComponents, 'fetcher' | 'config'>
): Promise<IEmailComponent> {
  const { fetcher, config } = components

  const notificationUrl = await config.requireString('NOTIFICATION_SERVICE_URL')
  const internalApiKey = await config.requireString('NOTIFICATION_SERVICE_TOKEN')

  async function sendEmail(email: string, subject: string, content: string): Promise<void> {
    const url = new URL('/notifications/email', notificationUrl).toString()
    await fetchVoid(
      () =>
        fetcher.fetch(url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${internalApiKey}`
          },
          body: JSON.stringify({ subject, content, email })
        }),
      async (r) => new Error(`Failed to fetch ${url}: ${r.status} ${await r.text()}`)
    )
  }

  return {
    sendEmail
  }
}
