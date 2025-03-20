import { WsUserData } from '../../../src/types'
import { isAuthenticated, isNotAuthenticated } from '../../../src/utils/wsUserData'
import { IUWebSocketEventMap } from '../../../src/utils/UWebSocketTransport'
import { Emitter } from 'mitt'

describe('wsUserData', () => {
  const wsConnectionId = 'random-uuid'

  describe('isAuthenticated', () => {
    it('should return true if the user is authenticated', () => {
      const data: WsUserData = {
        auth: true,
        isConnected: false,
        eventEmitter: { emit: jest.fn() } as unknown as Emitter<IUWebSocketEventMap>,
        address: '0x123',
        wsConnectionId,
        transport: null,
        connectionStartTime: Date.now()
      }

      expect(isAuthenticated(data)).toBe(true)
    })

    it('should return false if the user is not authenticated', () => {
      const data: WsUserData = {
        auth: false,
        isConnected: false,
        eventEmitter: { emit: jest.fn() } as unknown as Emitter<IUWebSocketEventMap>,
        wsConnectionId,
        connectionStartTime: Date.now()
      }

      expect(isAuthenticated(data)).toBe(false)
    })
  })

  describe('isNotAuthenticated', () => {
    it('should return false if the user is authenticated', () => {
      const data: WsUserData = {
        auth: true,
        isConnected: false,
        eventEmitter: { emit: jest.fn() } as unknown as Emitter<IUWebSocketEventMap>,
        address: '0x123',
        wsConnectionId,
        transport: null,
        connectionStartTime: Date.now()
      }

      expect(isNotAuthenticated(data)).toBe(false)
    })

    it('should return true with the correct type if the user is not authenticated', () => {
      const data: WsUserData = {
        auth: false,
        isConnected: false,
        wsConnectionId,
        connectionStartTime: Date.now()
      }

      expect(isNotAuthenticated(data)).toBe(true)
    })
  })
})
