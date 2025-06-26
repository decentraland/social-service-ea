import { Empty } from '@dcl/protocol/out-ts/google/protobuf/empty.gen'
import { getIncomingPrivateVoiceChatRequestsService } from '../../../../../src/controllers/handlers/rpc/get-incoming-private-voice-chat-requests'
import { RpcServerContext, RPCServiceContext, PrivateVoiceChat } from '../../../../../src/types'
import { IVoiceComponent } from '../../../../../src/logic/voice'
import { createVoiceMockedComponent } from '../../../../mocks/components/voice'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { IncomingVoiceChatNotFoundError } from '../../../../../src/logic/voice/errors'

describe('getIncomingPrivateVoiceChatRequestsService', () => {
  let mockVoice: jest.Mocked<IVoiceComponent>
  let mockLogs: ReturnType<typeof createLogsMockedComponent>
  let serviceContext: RPCServiceContext<'logs' | 'voice'>
  let service: ReturnType<typeof getIncomingPrivateVoiceChatRequestsService>
  let getIncomingPrivateVoiceChatMock: jest.MockedFn<IVoiceComponent['getIncomingPrivateVoiceChat']>
  let errorLogMock: jest.MockedFn<ReturnType<ILoggerComponent['getLogger']>['error']>
  let request: Empty
  let context: RpcServerContext
  const address = '0x1234567890abcdef'
  const callId = 'test-call-id-123'
  const callerAddress = '0xabcdef1234567890'

  beforeEach(() => {
    errorLogMock = jest.fn()
    getIncomingPrivateVoiceChatMock = jest.fn()

    mockVoice = createVoiceMockedComponent({
      getIncomingPrivateVoiceChat: getIncomingPrivateVoiceChatMock
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

    service = getIncomingPrivateVoiceChatRequestsService(serviceContext)

    request = {}

    context = {
      address
    } as RpcServerContext
  })

  describe('when getting incoming private voice chat requests successfully', () => {
    beforeEach(() => {
      const mockPrivateVoiceChat: PrivateVoiceChat = {
        id: callId,
        caller_address: callerAddress,
        callee_address: address,
        created_at: new Date('2024-01-01T00:00:00Z')
      }
      getIncomingPrivateVoiceChatMock.mockResolvedValueOnce(mockPrivateVoiceChat)
    })

    it('should resolve with an ok response with the call id and caller address', async () => {
      const result = await service(request, context)

      expect(getIncomingPrivateVoiceChatMock).toHaveBeenCalledWith(address)

      expect(result).toEqual({
        response: {
          $case: 'ok',
          ok: {
            callId,
            caller: {
              address: callerAddress
            }
          }
        }
      })
    })
  })

  describe('when getting incoming private voice chat requests fails with an incoming voice chat not found error', () => {
    beforeEach(() => {
      getIncomingPrivateVoiceChatMock.mockRejectedValueOnce(new IncomingVoiceChatNotFoundError(address))
    })

    it('should resolve with a not found response and log the error message', async () => {
      const result = await service(request, context)

      expect(result).toEqual({
        response: {
          $case: 'notFound',
          notFound: {
            message: `The incoming voice chat for the address ${address} was not found`
          }
        }
      })

      expect(errorLogMock).toHaveBeenCalledWith(
        `Error getting incoming private voice chat: The incoming voice chat for the address ${address} was not found`
      )
    })
  })

  describe('when getting incoming private voice chat requests fails with an unknown error', () => {
    const errorMessage = 'Internal server error'

    beforeEach(() => {
      getIncomingPrivateVoiceChatMock.mockRejectedValueOnce(new Error(errorMessage))
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

      expect(mockLogs.getLogger('get-incoming-private-voice-chat-requests-service').error).toHaveBeenCalledWith(
        'Error getting incoming private voice chat: Internal server error'
      )
    })
  })
})
