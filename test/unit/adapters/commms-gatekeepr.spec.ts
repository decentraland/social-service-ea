import { ILoggerComponent, IFetchComponent } from '@well-known-components/interfaces'
import { createCommsGatekeeperComponent } from '../../../src/adapters/comms-gatekeeper'
import { ICommsGatekeeperComponent, PrivateMessagesPrivacy } from '../../../src/types'
import { mockConfig } from '../../mocks/components'

let fetchMock: jest.Mock
let errorLogMock: jest.Mock
let warnLogMock: jest.Mock
let infoLogMock: jest.Mock
let commsGatekeeper: ICommsGatekeeperComponent

beforeEach(async () => {
  fetchMock = jest.fn()
  errorLogMock = jest.fn()
  warnLogMock = jest.fn()
  infoLogMock = jest.fn()
  const fetcher: IFetchComponent = {
    fetch: fetchMock
  }
  const logs: ILoggerComponent = {
    getLogger: jest.fn().mockReturnValue({
      error: errorLogMock,
      warn: warnLogMock,
      info: infoLogMock
    })
  }

  commsGatekeeper = await createCommsGatekeeperComponent({ logs, config: mockConfig, fetcher })
})

describe('when updating the user privacy message metadata', () => {
  describe('and the request fails with a network error', () => {
    beforeEach(() => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'))
    })

    it('should log the error and reject with it', async () => {
      await expect(
        commsGatekeeper.updateUserPrivateMessagePrivacyMetadata('0x123', PrivateMessagesPrivacy.ALL)
      ).rejects.toThrow('Network error')
      expect(errorLogMock).toHaveBeenCalledWith(
        'Failed to update user private message privacy metadata for user 0x123: Network error'
      )
    })
  })

  describe('and the request resolves with a non 200 status code', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      })
    })

    it('should log the error and reject with it', async () => {
      await expect(
        commsGatekeeper.updateUserPrivateMessagePrivacyMetadata('0x123', PrivateMessagesPrivacy.ALL)
      ).rejects.toThrow('Server responded with status 400')
      expect(errorLogMock).toHaveBeenCalledWith(
        'Failed to update user private message privacy metadata for user 0x123: Server responded with status 400'
      )
    })
  })

  describe('and the request resolves with a 200 status code', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200
      })
    })

    it('should log the success message and resolve', async () => {
      await commsGatekeeper.updateUserPrivateMessagePrivacyMetadata('0x123', PrivateMessagesPrivacy.ALL)
      expect(infoLogMock).toHaveBeenCalledWith('Updated user private message privacy metadata for user 0x123 to all')
    })
  })
})
