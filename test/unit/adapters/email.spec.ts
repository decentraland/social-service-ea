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
    let content: string
    let requestBody: { subject: string; content: string; email: string }

    beforeEach(() => {
      email = 'test@example.com'
      subject = 'Test Subject'
      content = 'Test email body content'
      requestBody = { subject, content: content, email }
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
        await emailComponent.sendEmail(email, subject, content)

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
      let readResponseText: jest.Mock
      let thrown: Error | undefined

      beforeEach(async () => {
        readResponseText = jest.fn().mockResolvedValue(JSON.stringify({ error: 'Invalid email format' }))
        mockFetcher.fetch.mockResolvedValue({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: readResponseText
        } as any)
        thrown = await emailComponent.sendEmail(email, subject, content).catch((error) => error)
      })

      it('should throw an error carrying the status but not the upstream body', () => {
        expect(thrown).toEqual(
          new Error('Failed to fetch https://notification-service.decentraland.org/notifications/email: 400')
        )
      })

      it('should not read the response body', () => {
        expect(readResponseText).not.toHaveBeenCalled()
      })
    })

    describe('when the fetch fails with network error', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockRejectedValue(new Error('Network error'))
      })

      it('should throw the network error', async () => {
        await expect(emailComponent.sendEmail(email, subject, content)).rejects.toThrow('Network error')
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

      it('should still surface the status, since the body is never read', async () => {
        await expect(emailComponent.sendEmail(email, subject, content)).rejects.toThrow(
          'Failed to fetch https://notification-service.decentraland.org/notifications/email: 500'
        )
      })
    })
  })
})
