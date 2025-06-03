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

describe('when checking if a user is in a voice chat', () => {
  describe('and the user is in a voice chat', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ is_user_in_voice_chat: true })
      })
    })

    it('should resolve as true', () => {
      return expect(commsGatekeeper.isUserInAVoiceChat('0x123')).resolves.toBe(true)
    })
  })

  describe('and the user is not in a voice chat', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ is_user_in_voice_chat: false })
      })
    })

    it('should resolve as false', () => {
      return expect(commsGatekeeper.isUserInAVoiceChat('0x123')).resolves.toBe(false)
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
      await expect(commsGatekeeper.isUserInAVoiceChat('0x123')).rejects.toThrow('Server responded with status 400')
      expect(errorLogMock).toHaveBeenCalledWith(
        'Failed to check if user 0x123 is in a voice chat: Server responded with status 400'
      )
    })
  })

  describe('and the request fails with a network error', () => {
    beforeEach(() => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'))
    })

    it('should log the error and reject with it', async () => {
      await expect(commsGatekeeper.isUserInAVoiceChat('0x123')).rejects.toThrow('Network error')
      expect(errorLogMock).toHaveBeenCalledWith('Failed to check if user 0x123 is in a voice chat: Network error')
    })
  })
})

describe('when getting the private voice chat credentials', () => {
  let roomId: string
  let calleeAddress: string
  let callerAddress: string

  beforeEach(() => {
    roomId = '1'
    calleeAddress = '0xBceaD48696C30eBfF0725D842116D334aAd585C1'
    callerAddress = '0x2B72b8d597c553b3173bca922B9ad871da751dA5'
  })

  describe('and the request resolves with a 200 status code', () => {
    let response: {
      [key: string]: {
        url: string
        token: string
      }
    }

    beforeEach(() => {
      response = {
        [calleeAddress]: { url: 'https://url.com', token: 'token' },
        [callerAddress]: { url: 'https://another-url.com', token: 'another-token' }
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(response)
      })
    })

    it('should resolve with the keys', async () => {
      const keys = await commsGatekeeper.getPrivateVoiceChatCredentials(roomId, calleeAddress, callerAddress)
      expect(keys).toEqual(response)
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
        commsGatekeeper.getPrivateVoiceChatCredentials(roomId, calleeAddress, callerAddress)
      ).rejects.toThrow('Server responded with status 400')
      expect(errorLogMock).toHaveBeenCalledWith(
        `Failed to get private voice chat keys for user ${calleeAddress} and ${callerAddress}: Server responded with status 400`
      )
    })
  })

  describe('and the request fails with a network error', () => {
    beforeEach(() => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'))
    })

    it('should log the error and reject with it', async () => {
      await expect(
        commsGatekeeper.getPrivateVoiceChatCredentials(roomId, calleeAddress, callerAddress)
      ).rejects.toThrow('Network error')
      expect(errorLogMock).toHaveBeenCalledWith(
        `Failed to get private voice chat keys for user ${calleeAddress} and ${callerAddress}: Network error`
      )
    })
  })
})
