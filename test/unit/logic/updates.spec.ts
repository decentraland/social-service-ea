import { friendshipUpdateHandler, friendConnectivityUpdateHandler } from '../../../src/logic/updates'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { mockDb, mockLogs } from '../../mocks/components'
import mitt from 'mitt'
import { Action, RpcServerContext, SubscriptionEventsEmitter } from '../../../src/types'

describe('updates handlers', () => {
  const logger = mockLogs.getLogger('test')
  let sharedContext: RpcServerContext

  beforeEach(() => {
    sharedContext = {
      address: '0x123',
      subscribers: {
        '0x456': mitt<SubscriptionEventsEmitter>(),
        '0x789': mitt<SubscriptionEventsEmitter>()
      }
    }
  })

  describe('friendshipUpdateHandler', () => {
    it('should emit friendship update to the correct subscriber', () => {
      const handler = friendshipUpdateHandler(sharedContext, logger)
      const emitSpy = jest.spyOn(sharedContext.subscribers['0x456'], 'emit')

      const update = {
        id: 'update-1',
        from: '0x123',
        to: '0x456',
        action: Action.REQUEST,
        timestamp: Date.now(),
        metadata: { message: 'Hello!' }
      }

      handler(JSON.stringify(update))

      expect(emitSpy).toHaveBeenCalledWith('friendshipUpdate', update)
    })

    it('should not emit if subscriber does not exist', () => {
      const handler = friendshipUpdateHandler(sharedContext, logger)
      const nonExistentUpdate = {
        id: 'update-1',
        from: '0x123',
        to: '0xNONEXISTENT',
        action: Action.REQUEST,
        timestamp: Date.now()
      }

      expect(handler(JSON.stringify(nonExistentUpdate))).resolves.toBeUndefined()
    })

    it('should log error on invalid JSON', () => {
      const handler = friendshipUpdateHandler(sharedContext, logger)
      const errorSpy = jest.spyOn(logger, 'error')

      handler('invalid json')

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error handling update:'),
        expect.objectContaining({ message: 'invalid json' })
      )
    })
  })

  describe('friendConnectivityUpdateHandler', () => {
    it('should emit status update to all online friends', async () => {
      const handler = friendConnectivityUpdateHandler(sharedContext, logger, mockDb)
      const emitSpy456 = jest.spyOn(sharedContext.subscribers['0x456'], 'emit')
      const emitSpy789 = jest.spyOn(sharedContext.subscribers['0x789'], 'emit')

      const onlineFriends = [{ address: '0x456' }, { address: '0x789' }]
      mockDb.getOnlineFriends.mockResolvedValueOnce(onlineFriends)

      const update = {
        address: '0x123',
        status: ConnectivityStatus.ONLINE
      }

      await handler(JSON.stringify(update))

      expect(mockDb.getOnlineFriends).toHaveBeenCalledWith('0x123', ['0x456', '0x789'])
      expect(emitSpy456).toHaveBeenCalledWith('friendStatusUpdate', update)
      expect(emitSpy789).toHaveBeenCalledWith('friendStatusUpdate', update)
    })

    it('should handle empty online friends list', async () => {
      const handler = friendConnectivityUpdateHandler(sharedContext, logger, mockDb)
      mockDb.getOnlineFriends.mockResolvedValueOnce([])

      const update = {
        address: '0x123',
        status: ConnectivityStatus.ONLINE
      }

      await handler(JSON.stringify(update))

      expect(mockDb.getOnlineFriends).toHaveBeenCalled()
    })

    it('should log error on invalid JSON', async () => {
      const handler = friendConnectivityUpdateHandler(sharedContext, logger, mockDb)
      const errorSpy = jest.spyOn(logger, 'error')

      await handler('invalid json')

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error handling update:'),
        expect.objectContaining({ message: 'invalid json' })
      )
    })

    it('should handle database errors gracefully', async () => {
      const handler = friendConnectivityUpdateHandler(sharedContext, logger, mockDb)
      const errorSpy = jest.spyOn(logger, 'error')
      const error = new Error('Database error')

      mockDb.getOnlineFriends.mockRejectedValueOnce(error)

      const update = {
        address: '0x123',
        status: ConnectivityStatus.ONLINE
      }

      await handler(JSON.stringify(update))

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error handling update:'),
        expect.objectContaining({
          error,
          message: JSON.stringify(update)
        })
      )
    })
  })
})
