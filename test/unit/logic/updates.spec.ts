import {
  friendshipUpdateHandler,
  friendConnectivityUpdateHandler,
  handleSubscriptionUpdates,
  ILogger,
  friendshipAcceptedUpdateHandler,
  blockUpdateHandler,
  privateVoiceChatUpdateHandler
} from '../../../src/logic/updates'
import { ConnectivityStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { mockCatalystClient, mockFriendsDB, mockLogs } from '../../mocks/components'
import mitt, { Emitter } from 'mitt'
import { Action, ISubscribersContext, RpcServerContext, SubscriptionEventsEmitter } from '../../../src/types'
import { sleep } from '../../../src/utils/timer'
import { mockProfile } from '../../mocks/profile'
import { createSubscribersContext } from '../../../src/adapters/rpc-server/subscribers-context'
import { VoiceChatStatus } from '../../../src/logic/voice/types'

describe('updates handlers', () => {
  const logger = mockLogs.getLogger('test')
  let subscribersContext: ISubscribersContext

  beforeEach(() => {
    subscribersContext = createSubscribersContext()
    subscribersContext.addSubscriber('0x456', mitt<SubscriptionEventsEmitter>())
    subscribersContext.addSubscriber('0x789', mitt<SubscriptionEventsEmitter>())
  })

  describe('friendshipUpdateHandler', () => {
    it('should emit friendship update to the correct subscriber', () => {
      const handler = friendshipUpdateHandler(subscribersContext, logger)
      const subscriber = subscribersContext.getOrAddSubscriber('0x456')
      const emitSpy = jest.spyOn(subscriber, 'emit')

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
      const handler = friendshipUpdateHandler(subscribersContext, logger)
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
      const handler = friendshipUpdateHandler(subscribersContext, logger)
      const errorSpy = jest.spyOn(logger, 'error')

      handler('invalid json')

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error handling update:'),
        expect.objectContaining({ message: 'invalid json' })
      )
    })
  })

  describe('friendshipAcceptedUpdateHandler', () => {
    it('should emit friendship update to the correct subscribers', () => {
      const handler = friendshipAcceptedUpdateHandler(subscribersContext, logger)
      const subscriber123 = subscribersContext.getOrAddSubscriber('0x123')
      const subscriber456 = subscribersContext.getOrAddSubscriber('0x456')
      const emitSpy123 = jest.spyOn(subscriber123, 'emit')
      const emitSpy456 = jest.spyOn(subscriber456, 'emit')

      const update = {
        id: 'update-1',
        from: '0x123',
        to: '0x456',
        action: Action.ACCEPT,
        timestamp: Date.now(),
        metadata: { message: 'Hello!' }
      }

      handler(JSON.stringify(update))

      expect(emitSpy123).toHaveBeenCalledWith('friendConnectivityUpdate', {
        address: '0x456',
        status: ConnectivityStatus.ONLINE
      })

      expect(emitSpy456).toHaveBeenCalledWith('friendConnectivityUpdate', {
        address: '0x123',
        status: ConnectivityStatus.ONLINE
      })
    })

    it.each([Action.DELETE, Action.REQUEST, Action.REJECT, Action.CANCEL])(
      'should ignore the update if the action is %s',
      (action) => {
        const handler = friendshipAcceptedUpdateHandler(subscribersContext, logger)
        const nonExistentUpdate = {
          id: 'update-1',
          from: '0x123',
          to: '0x456',
          action,
          timestamp: Date.now()
        }

        expect(handler(JSON.stringify(nonExistentUpdate))).resolves.toBeUndefined()
      }
    )

    it('should not emit if subscriber does not exist', () => {
      const handler = friendshipAcceptedUpdateHandler(subscribersContext, logger)
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
      const handler = friendshipAcceptedUpdateHandler(subscribersContext, logger)
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
      const handler = friendConnectivityUpdateHandler(subscribersContext, logger, mockFriendsDB)
      const subscriber456 = subscribersContext.getOrAddSubscriber('0x456')
      const subscriber789 = subscribersContext.getOrAddSubscriber('0x789')
      const emitSpy456 = jest.spyOn(subscriber456, 'emit')
      const emitSpy789 = jest.spyOn(subscriber789, 'emit')

      const onlineFriends = [{ address: '0x456' }, { address: '0x789' }]
      mockFriendsDB.getOnlineFriends.mockResolvedValueOnce(onlineFriends)

      const update = {
        address: '0x123',
        status: ConnectivityStatus.ONLINE
      }

      await handler(JSON.stringify(update))

      expect(mockFriendsDB.getOnlineFriends).toHaveBeenCalledWith('0x123', ['0x456', '0x789'])
      expect(emitSpy456).toHaveBeenCalledWith('friendConnectivityUpdate', update)
      expect(emitSpy789).toHaveBeenCalledWith('friendConnectivityUpdate', update)
    })

    it('should handle empty online friends list', async () => {
      const handler = friendConnectivityUpdateHandler(subscribersContext, logger, mockFriendsDB)
      mockFriendsDB.getOnlineFriends.mockResolvedValueOnce([])

      const update = {
        address: '0x123',
        status: ConnectivityStatus.ONLINE
      }

      await handler(JSON.stringify(update))

      expect(mockFriendsDB.getOnlineFriends).toHaveBeenCalled()
    })

    it('should log error on invalid JSON', async () => {
      const handler = friendConnectivityUpdateHandler(subscribersContext, logger, mockFriendsDB)
      const errorSpy = jest.spyOn(logger, 'error')

      await handler('invalid json')

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error handling update:'),
        expect.objectContaining({ message: 'invalid json' })
      )
    })

    it('should handle database errors gracefully', async () => {
      const handler = friendConnectivityUpdateHandler(subscribersContext, logger, mockFriendsDB)
      const errorSpy = jest.spyOn(logger, 'error')
      const error = new Error('Database error')

      mockFriendsDB.getOnlineFriends.mockRejectedValueOnce(error)

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

  describe('blockUpdateHandler', () => {
    it('should emit block update to the correct subscriber', () => {
      const handler = blockUpdateHandler(subscribersContext, logger)
      const subscriber = subscribersContext.getOrAddSubscriber('0x456')
      const emitSpy = jest.spyOn(subscriber, 'emit')

      const update = {
        blockerAddress: '0x123',
        blockedAddress: '0x456',
        isBlocked: true
      }

      handler(JSON.stringify(update))

      expect(emitSpy).toHaveBeenCalledWith('blockUpdate', update)
    })

    it('should not emit if subscriber does not exist', () => {
      const handler = blockUpdateHandler(subscribersContext, logger)
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
      const handler = blockUpdateHandler(subscribersContext, logger)
      const errorSpy = jest.spyOn(logger, 'error')

      handler('invalid json')

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error handling update:'),
        expect.objectContaining({ message: 'invalid json' })
      )
    })
  })

  describe('when handling private voice chat updates', () => {
    let handler: ReturnType<typeof privateVoiceChatUpdateHandler>
    let callerAddress: string
    let calleeAddress: string
    let callId: string
    let callerEmitSpy: jest.SpyInstance
    let calleeEmitSpy: jest.SpyInstance
    let update: any

    beforeEach(() => {
      handler = privateVoiceChatUpdateHandler(subscribersContext, logger)
      callerAddress = '0x123'
      calleeAddress = '0x456'
      callId = 'voice-call-1'

      const caller = subscribersContext.getOrAddSubscriber(callerAddress)
      const callee = subscribersContext.getOrAddSubscriber(calleeAddress)
      callerEmitSpy = jest.spyOn(caller, 'emit')
      calleeEmitSpy = jest.spyOn(callee, 'emit')

      // Reset update object for each test
      update = {
        id: callId,
        callerAddress,
        calleeAddress,
        status: VoiceChatStatus.REQUESTED, // Default status, will be overridden in specific tests
        timestamp: Date.now()
      }
    })

    describe('and the voice chat status is REQUESTED', () => {
      beforeEach(() => {
        update.status = VoiceChatStatus.REQUESTED
      })

      describe('and the calleeAddress is present', () => {
        it('should emit the update to the callee', () => {
          handler(JSON.stringify(update))

          expect(calleeEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })

      describe('and the calleeAddress is missing', () => {
        beforeEach(() => {
          update.calleeAddress = undefined
        })

        it('should not emit the update to any subscriber', () => {
          handler(JSON.stringify(update))

          expect(callerEmitSpy).not.toHaveBeenCalled()
          expect(calleeEmitSpy).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the voice chat status is ACCEPTED', () => {
      beforeEach(() => {
        update.status = VoiceChatStatus.ACCEPTED
      })

      describe('and the callerAddress is present', () => {
        it('should emit the update to the caller', () => {
          handler(JSON.stringify(update))

          expect(callerEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })

      describe('and the callerAddress is missing', () => {
        beforeEach(() => {
          update.callerAddress = undefined
        })

        it('should not emit the update to any subscriber', () => {
          handler(JSON.stringify(update))

          expect(callerEmitSpy).not.toHaveBeenCalled()
          expect(calleeEmitSpy).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the voice chat status is REJECTED', () => {
      beforeEach(() => {
        update.status = VoiceChatStatus.REJECTED
      })

      describe('and the callerAddress is present', () => {
        it('should emit the update to the caller', () => {
          handler(JSON.stringify(update))

          expect(callerEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })

      describe('and the callerAddress is missing', () => {
        beforeEach(() => {
          update.callerAddress = undefined
        })

        it('should not emit the update to any subscriber', () => {
          handler(JSON.stringify(update))

          expect(callerEmitSpy).not.toHaveBeenCalled()
          expect(calleeEmitSpy).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the voice chat status is ENDED', () => {
      beforeEach(() => {
        update.status = VoiceChatStatus.ENDED
      })

      describe('and both callerAddress and calleeAddress are present', () => {
        it('should emit the update to both the caller and the callee', () => {
          handler(JSON.stringify(update))

          expect(callerEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
          expect(calleeEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })

      describe('and only callerAddress is present', () => {
        beforeEach(() => {
          update.calleeAddress = undefined
        })

        it('should emit the update only to the caller', () => {
          handler(JSON.stringify(update))

          expect(callerEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })

      describe('and only calleeAddress is present', () => {
        beforeEach(() => {
          update.callerAddress = undefined
        })

        it('should emit the update only to the callee', () => {
          handler(JSON.stringify(update))

          expect(calleeEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        })
      })
    })

    describe('and the voice chat status is EXPIRED', () => {
      beforeEach(() => {
        update.status = VoiceChatStatus.EXPIRED
      })

      it('should emit the update to both the caller and the callee', () => {
        handler(JSON.stringify(update))

        expect(callerEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
        expect(calleeEmitSpy).toHaveBeenCalledWith('privateVoiceChatUpdate', update)
      })
    })

    describe('and the voice chat status is unknown', () => {
      beforeEach(() => {
        update.status = 'unknown' as VoiceChatStatus
      })

      it('should not emit the update to any subscriber', () => {
        handler(JSON.stringify(update))

        expect(callerEmitSpy).not.toHaveBeenCalled()
        expect(calleeEmitSpy).not.toHaveBeenCalled()
      })
    })

    describe('and the subscriber does not exist', () => {
      beforeEach(() => {
        update.callerAddress = '0xNONEXISTENT'
        update.status = VoiceChatStatus.ACCEPTED
      })

      it('should resolve without emitting to any subscriber', () => {
        expect(handler(JSON.stringify(update))).resolves.toBeUndefined()
      })
    })
  })

  describe('handleSubscriptionUpdates', () => {
    let eventEmitter: Emitter<SubscriptionEventsEmitter>
    let logger: ILogger
    let parser: jest.Mock
    let rpcContext: RpcServerContext
    let subscribersContext: ISubscribersContext

    const friendshipUpdate = { id: '1', to: '0x456', from: '0x123', action: Action.REQUEST, timestamp: Date.now() }
    const blockUpdate = { blockerAddress: '0x456', blockedAddress: '0x123', isBlocked: true }

    beforeEach(() => {
      eventEmitter = mitt<SubscriptionEventsEmitter>()
      logger = mockLogs.getLogger('test')
      parser = jest.fn()
      mockCatalystClient.getProfile.mockResolvedValue(mockProfile)

      subscribersContext = createSubscribersContext()
      subscribersContext.addSubscriber('0x123', eventEmitter)

      rpcContext = {
        address: '0x123',
        subscribersContext
      }
    })

    it('should use existing emitter from context', async () => {
      parser.mockResolvedValueOnce({ parsed: true })

      const generator = handleSubscriptionUpdates({
        rpcContext,
        eventName: 'friendshipUpdate',
        components: {
          catalystClient: mockCatalystClient,
          logger
        },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
        shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from === '0x123',
        parser
      })

      const resultPromise = generator.next()
      rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)

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
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
        shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from === '0x123',
        parser
      })

      const resultPromise = generator.next()
      rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)

      const result = await resultPromise
      expect(result.value).toEqual({ parsed: true })
      expect(parser).toHaveBeenCalledWith(friendshipUpdate, mockProfile)
    })

    it('should yield multiple updates', async () => {
      const generator = handleSubscriptionUpdates({
        rpcContext,
        eventName: 'friendshipUpdate',
        components: {
          catalystClient: mockCatalystClient,
          logger
        },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
        shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from === '0x123',
        parser
      })

      for (let i = 0; i < 2; i++) {
        parser.mockResolvedValueOnce({ parsed: i })
        const resultPromise = generator.next()
        rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)
        const result = await resultPromise
        expect(result.value).toEqual({ parsed: i })
        expect(parser).toHaveBeenCalledWith(friendshipUpdate, mockProfile)
      }
    })

    it('should log error if parser returns null', async () => {
      parser.mockResolvedValueOnce(null)
      const generator = handleSubscriptionUpdates({
        rpcContext,
        eventName: 'friendshipUpdate',
        components: { catalystClient: mockCatalystClient, logger },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
        shouldHandleUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from === '0x123',
        parser
      })

      generator.next()
      rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)

      await sleep(100)

      expect(logger.error).toHaveBeenCalledWith(`Unable to parse friendshipUpdate`, {
        update: JSON.stringify(friendshipUpdate)
      })
    })

    it('should skip update if shouldHandleUpdate returns false', async () => {
      parser.mockResolvedValueOnce({ parsed: true })

      const generator = handleSubscriptionUpdates({
        rpcContext,
        eventName: 'friendshipUpdate',
        components: { catalystClient: mockCatalystClient, logger },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
        shouldHandleUpdate: () => false,
        parser
      })

      const resultPromise = generator.next()
      rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)

      await sleep(100)

      expect(resultPromise).resolves.toBeUndefined()
    })

    it('should handle errors in the generator loop', async () => {
      const error = new Error('Test error')
      parser.mockRejectedValueOnce(error)

      const generator = handleSubscriptionUpdates({
        rpcContext,
        eventName: 'friendshipUpdate',
        components: { catalystClient: mockCatalystClient, logger },
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['friendshipUpdate']) => update.from,
        shouldHandleUpdate: () => true,
        parser
      })

      const resultPromise = generator.next()
      rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('friendshipUpdate', friendshipUpdate)

      await expect(resultPromise).rejects.toThrow('Test error')
      expect(logger.error).toHaveBeenCalledWith('Error in generator loop', {
        error: JSON.stringify(error),
        address: '0x123',
        event: 'friendshipUpdate'
      })
    })

    it('should skip retrieving profile if shouldRetrieveProfile is false', async () => {
      parser.mockResolvedValueOnce({ parsed: true })

      const generator = handleSubscriptionUpdates({
        rpcContext,
        eventName: 'blockUpdate',
        components: {
          catalystClient: mockCatalystClient,
          logger
        },
        shouldRetrieveProfile: false,
        getAddressFromUpdate: (update: SubscriptionEventsEmitter['blockUpdate']) => update.blockerAddress,
        shouldHandleUpdate: (update: SubscriptionEventsEmitter['blockUpdate']) => update.blockedAddress === '0x123',
        parser
      })

      const resultPromise = generator.next()
      rpcContext.subscribersContext.getOrAddSubscriber('0x123').emit('blockUpdate', blockUpdate)

      const result = await resultPromise
      expect(result.value).toEqual({ parsed: true })
      expect(parser).toHaveBeenCalledWith(blockUpdate, null)
      expect(mockCatalystClient.getProfile).not.toHaveBeenCalled()
    })
  })
})
