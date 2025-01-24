import {
  friendshipUpdateHandler,
  friendConnectivityUpdateHandler,
  handleSubscriptionUpdates,
  ILogger
} from '../../../src/logic/updates'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { mockCatalystClient, mockDb, mockLogs } from '../../mocks/components'
import mitt, { Emitter } from 'mitt'
import { Action, RpcServerContext, SubscriptionEventsEmitter } from '../../../src/types'
import { sleep } from '../../../src/utils/timer'
import { mockProfile, PROFILE_IMAGES_URL } from '../../mocks/profile'

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
      expect(emitSpy456).toHaveBeenCalledWith('friendConnectivityUpdate', update)
      expect(emitSpy789).toHaveBeenCalledWith('friendConnectivityUpdate', update)
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

  describe('handleSubscriptionUpdates', () => {
    let eventEmitter: Emitter<SubscriptionEventsEmitter>
    let logger: ILogger
    let parser: jest.Mock
    let rpcContext: RpcServerContext

    const friendshipUpdate = { id: '1', to: '0x456', from: '0x123', action: Action.REQUEST, timestamp: Date.now() }

    beforeEach(() => {
      eventEmitter = mitt<SubscriptionEventsEmitter>()
      logger = mockLogs.getLogger('test')
      parser = jest.fn()
      mockCatalystClient.getEntityByPointer.mockResolvedValue(mockProfile)

      rpcContext = {
        address: '0x123',
        subscribers: {}
      }
    })

    it('should create and store emitter in context if not exists', async () => {
      parser.mockResolvedValueOnce({ parsed: true })

      const generator = handleSubscriptionUpdates({
        rpcContext,
        eventName: 'friendshipUpdate',
        components: {
          catalystClient: mockCatalystClient,
          logger
        },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.to,
        parser,
        parseArgs: [PROFILE_IMAGES_URL]
      })

      // Start consuming the generator
      const resultPromise = generator.next()

      // Verify emitter was created and stored
      expect(rpcContext.subscribers['0x123']).toBeDefined()
      expect(rpcContext.subscribers['0x123'].all).toBeDefined()

      // Emit event using the stored emitter
      rpcContext.subscribers['0x123'].emit('friendshipUpdate', friendshipUpdate)

      const result = await resultPromise
      expect(result.value).toEqual({ parsed: true })
    })

    it('should reuse existing emitter from context', async () => {
      const existingEmitter = mitt<SubscriptionEventsEmitter>()
      rpcContext.subscribers['0x123'] = existingEmitter
      parser.mockResolvedValueOnce({ parsed: true })

      const generator = handleSubscriptionUpdates({
        rpcContext,
        eventName: 'friendshipUpdate',
        components: {
          catalystClient: mockCatalystClient,
          logger
        },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.to,
        parser,
        parseArgs: [PROFILE_IMAGES_URL]
      })

      // Start consuming the generator
      const resultPromise = generator.next()

      // Verify the existing emitter is being used
      expect(rpcContext.subscribers['0x123']).toBe(existingEmitter)

      // Emit event using the existing emitter
      existingEmitter.emit('friendshipUpdate', friendshipUpdate)

      const result = await resultPromise
      expect(result.value).toEqual({ parsed: true })
    })

    it('should yield parsed updates', async () => {
      parser.mockResolvedValueOnce({ parsed: true })

      const generator = handleSubscriptionUpdates({
        rpcContext,
        eventName: 'friendshipUpdate',
        components: {
          catalystClient: mockCatalystClient,
          logger
        },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.to,
        parser,
        parseArgs: [PROFILE_IMAGES_URL]
      })

      const resultPromise = generator.next()
      rpcContext.subscribers['0x123'].emit('friendshipUpdate', friendshipUpdate)

      const result = await resultPromise
      expect(result.value).toEqual({ parsed: true })
      expect(parser).toHaveBeenCalledWith(friendshipUpdate, mockProfile, PROFILE_IMAGES_URL)
    })

    it('should yield multiple updates', async () => {
      const generator = handleSubscriptionUpdates({
        rpcContext,
        eventName: 'friendshipUpdate',
        components: {
          catalystClient: mockCatalystClient,
          logger
        },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.to,
        parser,
        parseArgs: [PROFILE_IMAGES_URL]
      })

      for (let i = 0; i < 2; i++) {
        parser.mockResolvedValueOnce({ parsed: i })
        const resultPromise = generator.next()
        rpcContext.subscribers['0x123'].emit('friendshipUpdate', friendshipUpdate)
        const result = await resultPromise
        expect(result.value).toEqual({ parsed: i })
        expect(parser).toHaveBeenCalledWith(friendshipUpdate, mockProfile, PROFILE_IMAGES_URL)
      }
    })

    it('should log error if parser returns null', async () => {
      parser.mockResolvedValueOnce(null)
      const generator = handleSubscriptionUpdates({
        rpcContext,
        eventName: 'friendshipUpdate',
        components: { catalystClient: mockCatalystClient, logger },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.to,
        parser,
        parseArgs: [PROFILE_IMAGES_URL]
      })

      const resultPromise = generator.next()
      rpcContext.subscribers['0x123'].emit('friendshipUpdate', friendshipUpdate)

      await sleep(100) // could be flaky

      expect(logger.error).toHaveBeenCalledWith('Unable to parse friendshipUpdate:', {
        update: JSON.stringify(friendshipUpdate)
      })
    })
  })
})
