import { ILoggerComponent } from '@well-known-components/interfaces'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { subscribeToPrivateVoiceChatUpdatesService } from '../../../../../src/controllers/handlers/rpc/subscribe-to-private-voice-chat-updates'
import { IUpdateHandlerComponent, RpcServerContext, SubscriptionEventsEmitter } from '../../../../../src/types'
import { createLogsMockedComponent, createMockUpdateHandlerComponent } from '../../../../mocks/components'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'
import {
  PrivateVoiceChatStatus,
  PrivateVoiceChatUpdate
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { VoiceChatStatus } from '../../../../../src/logic/voice/types'

describe('when subscribing to private voice chat updates', () => {
  let logs: jest.Mocked<ILoggerComponent>
  let service: ReturnType<typeof subscribeToPrivateVoiceChatUpdatesService>
  let rpcContext: RpcServerContext
  let mockUpdateHandler: jest.Mocked<IUpdateHandlerComponent>
  let callerAddress: string
  let calleeAddress: string
  let callId: string

  beforeEach(() => {
    callerAddress = '0xBceaD48696C30eBfF0725D842116D334aAd585C1'
    calleeAddress = '0xC001010101010101010101010101010101010101'
    callId = '1'
    logs = createLogsMockedComponent()
    mockUpdateHandler = createMockUpdateHandlerComponent({})

    service = subscribeToPrivateVoiceChatUpdatesService({
      components: { logs, updateHandler: mockUpdateHandler }
    })

    rpcContext = {
      address: callerAddress,
      subscribersContext: createSubscribersContext()
    }
  })

  describe('when the subscription has updates', () => {
    let requestedUpdate: PrivateVoiceChatUpdate
    let acceptedUpdate: PrivateVoiceChatUpdate

    beforeEach(() => {
      requestedUpdate = {
        callId,
        status: PrivateVoiceChatStatus.VOICE_CHAT_REQUESTED,
        caller: { address: callerAddress }
      }

      acceptedUpdate = {
        callId,
        status: PrivateVoiceChatStatus.VOICE_CHAT_ACCEPTED,
        credentials: {
          connectionUrl: 'livekit:https://voice.decentraland.org?access_token=1234567890'
        }
      }

      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield requestedUpdate
        yield acceptedUpdate
      })
    })

    it('should yield all updates in sequence', async () => {
      const generator = service({} as Empty, rpcContext)

      const firstResult = await generator.next()
      expect(firstResult.value).toEqual(requestedUpdate)
      expect(firstResult.done).toBe(false)

      const secondResult = await generator.next()
      expect(secondResult.value).toEqual(acceptedUpdate)
      expect(secondResult.done).toBe(false)
    })
  })

  describe('when parsing updates', () => {
    let update: SubscriptionEventsEmitter['privateVoiceChatUpdate']

    describe('when the update is a REQUESTED status', () => {
      beforeEach(async () => {
        update = {
          callId,
          callerAddress,
          calleeAddress,
          status: VoiceChatStatus.REQUESTED
        }

        mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
          yield update
        })

        const generator = service({} as Empty, rpcContext)
        await generator.next()
      })

      it('should build the update with the call id, the request status and the caller address', () => {
        const result = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].parser(update)
        expect(result).toEqual({
          callId,
          status: PrivateVoiceChatStatus.VOICE_CHAT_REQUESTED,
          caller: { address: callerAddress }
        })
      })
    })

    describe('when the update is a ACCEPTED status', () => {
      beforeEach(async () => {
        update = {
          callId,
          callerAddress,
          status: VoiceChatStatus.ACCEPTED,
          credentials: {
            connectionUrl: 'livekit:https://voice.decentraland.org?access_token=1234567890'
          }
        }

        mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
          yield update
        })

        const generator = service({} as Empty, rpcContext)
        await generator.next()
      })

      it('should build the update with the call id and the accepted status', () => {
        const result = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].parser(update)
        expect(result).toEqual({
          callId,
          status: PrivateVoiceChatStatus.VOICE_CHAT_ACCEPTED,
          credentials: {
            connectionUrl: 'livekit:https://voice.decentraland.org?access_token=1234567890'
          }
        })
      })
    })

    describe('when the update is a REJECTED status', () => {
      beforeEach(async () => {
        update = {
          callId,
          callerAddress,
          status: VoiceChatStatus.REJECTED
        }

        mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
          yield update
        })

        const generator = service({} as Empty, rpcContext)
        await generator.next()
      })

      it('should build the update with the call id and the rejected status', () => {
        const result = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].parser(update)
        expect(result).toEqual({
          callId,
          status: PrivateVoiceChatStatus.VOICE_CHAT_REJECTED
        })
      })
    })

    describe('when the update is a EXPIRED status', () => {
      beforeEach(async () => {
        update = {
          callId,
          callerAddress,
          status: VoiceChatStatus.EXPIRED
        }

        mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
          yield update
        })

        const generator = service({} as Empty, rpcContext)
        await generator.next()
      })

      it('should build the update with the call id and the ended status', () => {
        const result = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].parser(update)
        expect(result).toEqual({
          callId,
          status: PrivateVoiceChatStatus.VOICE_CHAT_EXPIRED
        })
      })
    })

    describe('when the update is a ENDED status', () => {
      beforeEach(async () => {
        update = {
          callId,
          callerAddress,
          calleeAddress,
          status: VoiceChatStatus.ENDED
        }

        mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
          yield update
        })

        const generator = service({} as Empty, rpcContext)
        await generator.next()
      })

      it('should build the update with the call id and the ended status', () => {
        const result = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].parser(update)
        expect(result).toEqual({
          callId,
          status: PrivateVoiceChatStatus.VOICE_CHAT_ENDED
        })
      })
    })

    describe('when the update is a UNKNOWN status', () => {
      beforeEach(async () => {
        update = {
          callId,
          status: 'unknown' as VoiceChatStatus
        }

        mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
          yield update
        })

        const generator = service({} as Empty, rpcContext)
        await generator.next()
      })

      it('should throw an error', () => {
        expect(() => mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].parser(update)).toThrow(
          'Unknown voice chat status: unknown'
        )
      })
    })
  })
})
