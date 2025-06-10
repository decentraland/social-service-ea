import { endPrivateVoiceChatService } from '../../../../../src/adapters/rpc-server/services/end-private-voice-chat'
import { EndPrivateVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext, RPCServiceContext } from '../../../../../src/types'
import { IVoiceComponent } from '../../../../../src/logic/voice'
import { createVoiceMockedComponent } from '../../../../mocks/components/voice'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { VoiceChatNotFoundError } from '../../../../../src/logic/voice/errors'

describe('endPrivateVoiceChatService', () => {
  let mockVoice: jest.Mocked<IVoiceComponent>
  let mockLogs: ReturnType<typeof createLogsMockedComponent>
  let serviceContext: RPCServiceContext<'logs' | 'voice'>
  let service: ReturnType<typeof endPrivateVoiceChatService>
  let endPrivateVoiceChatMock: jest.MockedFn<IVoiceComponent['endPrivateVoiceChat']>
  let errorLogMock: jest.MockedFn<ReturnType<ILoggerComponent['getLogger']>['error']>
  let request: EndPrivateVoiceChatPayload
  let context: RpcServerContext
  const callId = 'test-call-id-123'
  const address = '0x1234567890abcdef'

  beforeEach(() => {
    errorLogMock = jest.fn()
    endPrivateVoiceChatMock = jest.fn()

    mockVoice = createVoiceMockedComponent({
      endPrivateVoiceChat: endPrivateVoiceChatMock
    })

    mockLogs = createLogsMockedComponent({
      error: errorLogMock
    })

    serviceContext = {
      components: {
        logs: mockLogs,
        voice: mockVoice
      }
    }

    service = endPrivateVoiceChatService(serviceContext)

    request = {
      callId
    }

    context = {
      address
    } as RpcServerContext
  })

  describe('when ending a private voice chat successfully', () => {
    beforeEach(() => {
      endPrivateVoiceChatMock.mockResolvedValueOnce(undefined)
    })

    it('should resolve with an ok response with the call id and called the end voice chat with the call id and the caller address', async () => {
      const result = await service(request, context)

      expect(endPrivateVoiceChatMock).toHaveBeenCalledWith(callId, address)

      expect(result).toEqual({
        response: {
          $case: 'ok',
          ok: {
            callId
          }
        }
      })
    })
  })

  describe('when ending a private voice chat fails with a voice chat not found error', () => {
    beforeEach(() => {
      endPrivateVoiceChatMock.mockRejectedValueOnce(new VoiceChatNotFoundError(callId))
    })

    it('should resolve with a not found response and log the error message', async () => {
      const result = await service(request, context)

      expect(result).toEqual({
        response: {
          $case: 'notFound',
          notFound: {
            message: `The voice chat with id ${callId} was not found`
          }
        }
      })

      expect(errorLogMock).toHaveBeenCalledWith(
        `Error ending private voice chat: The voice chat with id ${callId} was not found`
      )
    })
  })

  describe('when ending a private voice chat fails with an unknown error', () => {
    const errorMessage = 'Internal server error'

    beforeEach(() => {
      endPrivateVoiceChatMock.mockRejectedValueOnce(new Error(errorMessage))
    })

    it('should resolve with an internal server error response and log the error message', async () => {
      const result = await service(request, context)

      expect(result).toEqual({
        response: {
          $case: 'internalServerError',
          internalServerError: {
            message: errorMessage
          }
        }
      })

      expect(mockLogs.getLogger('end-private-voice-chat-service').error).toHaveBeenCalledWith(
        `Error ending private voice chat: ${errorMessage}`
      )
    })
  })
})
