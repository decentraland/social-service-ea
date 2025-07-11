import { AppComponents, IEmailComponent } from '../types'

export async function createEmailComponent(
  components: Pick<AppComponents, 'fetcher' | 'config'>
): Promise<IEmailComponent> {
  const { fetcher, config } = components

  const notificationUrl = new URL(await config.requireString('NOTIFICATION_SERVICE_URL'))
  const internalApiKey = await config.requireString('INTERNAL_API_KEY')

  async function sendEmail(email: string, subject: string, body: string): Promise<void> {
    const url = new URL('/send-common-email', notificationUrl).toString()
    const response = await fetcher.fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalApiKey}`
      },
      body: JSON.stringify({ subject, body, email })
    })

    if (response.ok) {
      return
    }

    throw new Error(`Failed to fetch ${url}: ${response.status} ${await response.text()}`)
  }

  return {
    sendEmail
  }
}
