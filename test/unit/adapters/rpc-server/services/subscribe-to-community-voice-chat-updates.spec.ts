import { ILoggerComponent } from '@well-known-components/interfaces'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { subscribeToCommunityVoiceChatUpdatesService } from '../../../../../src/controllers/handlers/rpc/subscribe-to-community-voice-chat-updates'
import { IUpdateHandlerComponent, RpcServerContext, SubscriptionEventsEmitter } from '../../../../../src/types'
import { createLogsMockedComponent, createMockUpdateHandlerComponent } from '../../../../mocks/components'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'
import { CommunityVoiceChatUpdate } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'

describe('when subscribing to community voice chat updates', () => {
  let logs: jest.Mocked<ILoggerComponent>
  let service: ReturnType<typeof subscribeToCommunityVoiceChatUpdatesService>
  let rpcContext: RpcServerContext
  let mockUpdateHandler: jest.Mocked<IUpdateHandlerComponent>
  let userAddress: string
  let communityId: string
  let voiceChatId: string

  beforeEach(() => {
    userAddress = '0xBceaD48696C30eBfF0725D842116D334aAd585C1'
    communityId = 'test-community-123'
    voiceChatId = 'test-voice-chat-456'
    logs = createLogsMockedComponent()
    mockUpdateHandler = createMockUpdateHandlerComponent({})

    service = subscribeToCommunityVoiceChatUpdatesService({
      components: { logs, updateHandler: mockUpdateHandler }
    })

    rpcContext = {
      address: userAddress,
      subscribersContext: createSubscribersContext()
    }
  })

  describe('when the subscription has updates', () => {
    let startedUpdate: CommunityVoiceChatUpdate

    beforeEach(() => {
      startedUpdate = {
        communityId,
        voiceChatId,
        createdAt: Date.now()
      }

      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield startedUpdate
      })
    })

    it('should yield all updates in sequence', async () => {
      const generator = service({} as Empty, rpcContext)

      const firstResult = await generator.next()
      expect(firstResult.value).toEqual(startedUpdate)
      expect(firstResult.done).toBe(false)
    })

    it('should handle multiple updates in sequence', async () => {
      const secondUpdate: CommunityVoiceChatUpdate = {
        communityId: 'another-community',
        voiceChatId: 'another-voice-chat',
        createdAt: Date.now() + 1000
      }

      // Reset the mock to avoid conflicts
      mockUpdateHandler.handleSubscriptionUpdates.mockReset()
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield startedUpdate
        yield secondUpdate
      })

      const generator = service({} as Empty, rpcContext)

      const firstResult = await generator.next()
      expect(firstResult.value).toEqual(startedUpdate)
      expect(firstResult.done).toBe(false)

      const secondResult = await generator.next()
      expect(secondResult.value).toEqual(secondUpdate)
      expect(secondResult.done).toBe(false)
    })
  })

  describe('when parsing updates', () => {
    let update: SubscriptionEventsEmitter['communityVoiceChatUpdate']

    describe('when the update has valid community voice chat data', () => {
      beforeEach(async () => {
        update = {
          communityId,
          voiceChatId,
          status: 'started'
        }

        mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
          yield update
        })

        const generator = service({} as Empty, rpcContext)
        await generator.next()
      })

      it('should build the update with the community id, voice chat id and created timestamp', () => {
        const result = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].parser(update)
        expect(result).toEqual({
          communityId,
          voiceChatId,
          createdAt: expect.any(Number)
        })
      })

      it('should use current timestamp for createdAt', () => {
        const beforeCall = Date.now()
        const result = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].parser(update) as CommunityVoiceChatUpdate
        const afterCall = Date.now()
        
        expect(result.createdAt).toBeGreaterThanOrEqual(beforeCall)
        expect(result.createdAt).toBeLessThanOrEqual(afterCall)
      })
    })

    describe('when the update has minimal data', () => {
      beforeEach(async () => {
        update = {
          communityId: 'minimal-community',
          voiceChatId: 'minimal-voice-chat',
          status: 'started'
        }

        mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
          yield update
        })

        const generator = service({} as Empty, rpcContext)
        await generator.next()
      })

      it('should build the update with all required fields', () => {
        const result = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].parser(update)
        expect(result).toEqual({
          communityId: 'minimal-community',
          voiceChatId: 'minimal-voice-chat',
          createdAt: expect.any(Number)
        })
      })
    })
  })

  describe('when subscription encounters errors', () => {
    beforeEach(() => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        throw new Error('Subscription error')
      })
    })

    it('should propagate the error and log it', async () => {
      const generator = service({} as Empty, rpcContext)

      await expect(generator.next()).rejects.toThrow('Subscription error')
      expect(logs.getLogger('subscribe-to-community-voice-chat-updates-service').error).toHaveBeenCalledWith(
        'Error in community voice chat updates subscription: Subscription error'
      )
    })
  })

  describe('when subscription is properly configured', () => {
    beforeEach(async () => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        // Empty generator to test configuration
      })

      const generator = service({} as Empty, rpcContext)
      await generator.next()
    })

    it('should configure handleSubscriptionUpdates with correct parameters', () => {
      const handlerCall = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0]
      const mockUpdate: SubscriptionEventsEmitter['communityVoiceChatUpdate'] = {
        communityId: 'test',
        voiceChatId: 'test',
        status: 'started'
      }
      
      expect(handlerCall.rpcContext).toBe(rpcContext)
      expect(handlerCall.eventName).toBe('communityVoiceChatUpdate')
      expect(handlerCall.shouldRetrieveProfile).toBe(false)
      expect(handlerCall.getAddressFromUpdate(mockUpdate)).toBe('not-needed')
      expect(handlerCall.shouldHandleUpdate(mockUpdate)).toBe(true)
      expect(typeof handlerCall.parser).toBe('function')
    })
  })

  describe('when subscription service is configured', () => {
    it('should handle proper service initialization', () => {
      expect(service).toBeDefined()
      expect(typeof service).toBe('function')
    })
  })
}) 