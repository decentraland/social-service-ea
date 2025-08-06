import { ILoggerComponent } from '@well-known-components/interfaces'
import { StartPrivateVoiceChatPayload } from '@dcl/protocol/out-ts/decentraland/social_service/v2/social_service_v2.gen'
import { startPrivateVoiceChatService } from '../../../../../src/controllers/handlers/rpc/start-private-voice-chat'
import { IVoiceComponent } from '../../../../../src/logic/voice'
import { ICommsGatekeeperComponent } from '../../../../../src/types/components'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { createVoiceMockedComponent } from '../../../../mocks/components/voice'
import { createCommsGatekeeperMockedComponent } from '../../../../mocks/components/comms-gatekeeper'
import {
  UserAlreadyInVoiceChatError,
  UsersAreCallingSomeoneElseError,
  VoiceChatNotAllowedError
} from '../../../../../src/logic/voice/errors'

describe('when starting a private voice chat', () => {
  let startPrivateVoiceChatMock: jest.MockedFn<IVoiceComponent['startPrivateVoiceChat']>
  let isUserInCommunityVoiceChatMock: jest.MockedFn<ICommsGatekeeperComponent['isUserInCommunityVoiceChat']>
  let logs: jest.Mocked<ILoggerComponent>
  let voice: jest.Mocked<IVoiceComponent>
  let commsGatekeeper: jest.Mocked<ICommsGatekeeperComponent>
  let callerAddress: string
  let calleeAddress: string
  let service: ReturnType<typeof startPrivateVoiceChatService>

  beforeEach(async () => {
    startPrivateVoiceChatMock = jest.fn()
    isUserInCommunityVoiceChatMock = jest.fn()
    callerAddress = '0xBceaD48696C30eBfF0725D842116D334aAd585C1'
    calleeAddress = '0xC001010101010101010101010101010101010101'
    logs = createLogsMockedComponent()
    voice = createVoiceMockedComponent({
      startPrivateVoiceChat: startPrivateVoiceChatMock
    })
    commsGatekeeper = createCommsGatekeeperMockedComponent({
      isUserInCommunityVoiceChat: isUserInCommunityVoiceChatMock
    })

    // By default, users are not in community voice chat
    isUserInCommunityVoiceChatMock.mockResolvedValue(false)

    service = startPrivateVoiceChatService({
      components: { voice, logs, commsGatekeeper }
    })
  })

  describe('and starting a private voice chat is successful', () => {
    let callId: string

    beforeEach(() => {
      callId = '1'
      startPrivateVoiceChatMock.mockResolvedValue(callId)
    })

    it('should resolve with an ok response and the call id', async () => {
      const result = await service(
        StartPrivateVoiceChatPayload.create({
          callee: { address: calleeAddress }
        }),
        {
          address: callerAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('ok')
      if (result.response?.$case === 'ok') {
        expect(result.response.ok.callId).toBe(callId)
      }
      expect(isUserInCommunityVoiceChatMock).toHaveBeenCalledWith(callerAddress)
      expect(isUserInCommunityVoiceChatMock).toHaveBeenCalledWith(calleeAddress)
    })
  })

  describe('and caller is in a community voice chat', () => {
    beforeEach(() => {
      isUserInCommunityVoiceChatMock.mockImplementation((userAddress: string) => {
        return Promise.resolve(userAddress === callerAddress)
      })
    })

    it('should resolve with a conflicting error response', async () => {
      const result = await service(
        StartPrivateVoiceChatPayload.create({
          callee: { address: calleeAddress }
        }),
        {
          address: callerAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('conflictingError')
      if (result.response?.$case === 'conflictingError') {
        expect(result.response.conflictingError.message).toBe(
          'Cannot start private voice chat while in a community voice chat'
        )
      }
      expect(isUserInCommunityVoiceChatMock).toHaveBeenCalledWith(callerAddress)
      expect(startPrivateVoiceChatMock).not.toHaveBeenCalled()
    })
  })

  describe('and callee is in a community voice chat', () => {
    beforeEach(() => {
      isUserInCommunityVoiceChatMock.mockImplementation((userAddress: string) => {
        return Promise.resolve(userAddress === calleeAddress)
      })
    })

    it('should resolve with a conflicting error response', async () => {
      const result = await service(
        StartPrivateVoiceChatPayload.create({
          callee: { address: calleeAddress }
        }),
        {
          address: callerAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('conflictingError')
      if (result.response?.$case === 'conflictingError') {
        expect(result.response.conflictingError.message).toBe(
          'Cannot start private voice chat: the callee is in a community voice chat'
        )
      }
      expect(isUserInCommunityVoiceChatMock).toHaveBeenCalledWith(callerAddress)
      expect(isUserInCommunityVoiceChatMock).toHaveBeenCalledWith(calleeAddress)
      expect(startPrivateVoiceChatMock).not.toHaveBeenCalled()
    })
  })

  describe('and starting a private voice chat fails with a voice chat not allowed error', () => {
    beforeEach(() => {
      startPrivateVoiceChatMock.mockRejectedValue(new VoiceChatNotAllowedError())
    })

    it('should resolve with a forbidden request response', async () => {
      const result = await service(
        StartPrivateVoiceChatPayload.create({
          callee: { address: calleeAddress }
        }),
        {
          address: callerAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('forbiddenError')
      if (result.response?.$case === 'forbiddenError') {
        expect(result.response.forbiddenError.message).toBe(
          'The callee or the caller are not accepting voice calls from users that are not friends'
        )
      }
    })
  })

  describe('and starting a private voice chat fails with a users are calling someone else error', () => {
    beforeEach(() => {
      startPrivateVoiceChatMock.mockRejectedValue(new UsersAreCallingSomeoneElseError())
    })

    it('should resolve with an invalid request response', async () => {
      const result = await service(
        StartPrivateVoiceChatPayload.create({
          callee: { address: calleeAddress }
        }),
        {
          address: callerAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('conflictingError')
      if (result.response?.$case === 'conflictingError') {
        expect(result.response.conflictingError.message).toBe('One of the users is busy calling someone else')
      }
    })
  })

  describe('and starting a private voice chat fails with a user already in voice chat error', () => {
    beforeEach(() => {
      startPrivateVoiceChatMock.mockRejectedValue(new UserAlreadyInVoiceChatError(calleeAddress))
    })

    it('should resolve with a conflicting request response', async () => {
      const result = await service(
        StartPrivateVoiceChatPayload.create({
          callee: { address: calleeAddress }
        }),
        {
          address: callerAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('conflictingError')
      if (result.response?.$case === 'conflictingError') {
        expect(result.response.conflictingError.message).toBe(
          `One of the users is already in a voice chat: ${calleeAddress}`
        )
      }
    })
  })

  describe('and starting a private voice chat fails with an unknown error', () => {
    let errorMessage: string

    beforeEach(() => {
      errorMessage = 'Internal server error'
      startPrivateVoiceChatMock.mockRejectedValue(new Error(errorMessage))
    })

    it('should resolve with an internal server error response', async () => {
      const result = await service(
        StartPrivateVoiceChatPayload.create({
          callee: { address: calleeAddress }
        }),
        {
          address: callerAddress,
          subscribersContext: undefined
        }
      )

      expect(result.response?.$case).toBe('internalServerError')
      if (result.response?.$case === 'internalServerError') {
        expect(result.response.internalServerError.message).toBe(errorMessage)
      }
    })
  })
})
