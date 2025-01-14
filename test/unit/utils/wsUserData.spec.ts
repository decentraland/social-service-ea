import { WsUserData, WsNotAuthenticatedUserData } from '../../../src/types'
import { isNotAuthenticated } from '../../../src/utils/wsUserData'
import { IUWebSocketEventMap } from '../../../src/utils/UWebSocketTransport'
import { Emitter } from 'mitt'

describe('wsUserData', () => {
  describe('isNotAuthenticated', () => {
    it('should return false if the user is authenticated', () => {
      const data: WsUserData = {
        auth: true,
        isConnected: false,
        eventEmitter: { emit: jest.fn() } as unknown as Emitter<IUWebSocketEventMap>,
        address: '0x123'
      }

      expect(isNotAuthenticated(data)).toBe(false)
    })

    it('should return true with the correct type if the user is not authenticated', () => {
      const data: WsUserData = {
        auth: false,
        isConnected: false
      }

      expect(isNotAuthenticated(data)).toBe(true)
    })
  })
})
