import { createEmailComponent } from '../../../src/adapters/email'
import { IEmailComponent } from '../../../src/types'
import { mockConfig, mockFetcher } from '../../mocks/components'

describe('EmailComponent', () => {
  let emailComponent: IEmailComponent
  let mockNotificationUrl: string
  let mockInternalApiKey: string

  beforeEach(async () => {
    mockNotificationUrl = 'https://notification-service.decentraland.org'
    mockInternalApiKey = 'internal-api-key-123'

    mockConfig.requireString.mockResolvedValueOnce(mockNotificationUrl).mockResolvedValueOnce(mockInternalApiKey)

    emailComponent = await createEmailComponent({
      fetcher: mockFetcher,
      config: mockConfig
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when sending an email', () => {
    let email: string
    let subject: string
    let body: string
    let requestBody: { subject: string; body: string; email: string }

    beforeEach(() => {
      email = 'test@example.com'
      subject = 'Test Subject'
      body = 'Test email body content'
      requestBody = { subject, body, email }
    })

    describe('with valid data and successful response', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockResolvedValue({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue('')
        } as any)
      })

      it('should make the POST request successfully', async () => {
        await emailComponent.sendEmail(email, subject, body)

        expect(mockConfig.requireString).toHaveBeenCalledWith('NOTIFICATION_SERVICE_URL')
        expect(mockConfig.requireString).toHaveBeenCalledWith('NOTIFICATION_SERVICE_TOKEN')
        expect(mockFetcher.fetch).toHaveBeenCalledWith(`${mockNotificationUrl}/notifications/email`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockInternalApiKey}`
          },
          body: JSON.stringify(requestBody)
        })
      })
    })

    describe('when the API returns a bad request error', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockResolvedValue({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: jest.fn().mockResolvedValue(
            JSON.stringify({
              error: 'Invalid email format'
            })
          )
        } as any)
      })

      it('should throw an error with response details', async () => {
        await expect(emailComponent.sendEmail(email, subject, body)).rejects.toThrow(
          'Failed to fetch https://notification-service.decentraland.org/notifications/email: 400 {"error":"Invalid email format"}'
        )
      })
    })

    describe('when the fetch fails with network error', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockRejectedValue(new Error('Network error'))
      })

      it('should throw the network error', async () => {
        await expect(emailComponent.sendEmail(email, subject, body)).rejects.toThrow('Network error')
      })
    })

    describe('when the response text cannot be read', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: jest.fn().mockRejectedValue(new Error('Cannot read response'))
        } as any)
      })

      it('should throw the text reading error', async () => {
        await expect(emailComponent.sendEmail(email, subject, body)).rejects.toThrow('Cannot read response')
      })
    })
  })
})
