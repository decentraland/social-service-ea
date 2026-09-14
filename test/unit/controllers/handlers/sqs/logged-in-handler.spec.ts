import { Events, LoggedInEvent, LoggedInCachedEvent } from '@dcl/schemas'
import { createLoggedInHandler } from '../../../../../src/controllers/handlers/sqs/logged-in-handler'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { ILoggerComponent } from '@well-known-components/interfaces/dist/components/logger'
import { IReferralComponent } from '../../../../../src/logic/referral/types'

describe('LoggedInHandler', () => {
  let handler: ReturnType<typeof createLoggedInHandler>
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockReferral: jest.Mocked<IReferralComponent>

  beforeEach(() => {
    mockLogs = createLogsMockedComponent({})
    mockReferral = {
      create: jest.fn(),
      updateProgress: jest.fn(),
      finalizeReferral: jest.fn().mockResolvedValue(undefined),
      getInvitedUsersAcceptedStats: jest.fn(),
      setReferralEmail: jest.fn(),
      setReferralRewardImage: jest.fn()
    }
    handler = createLoggedInHandler({ logs: mockLogs, referral: mockReferral })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when processing LOGGED_IN event', () => {
    let event: LoggedInEvent

    beforeEach(() => {
      event = {
        type: Events.Type.CLIENT,
        subType: Events.SubType.Client.LOGGED_IN,
        metadata: {
          userAddress: '0x1234567890123456789012345678901234567890'
        }
      } as LoggedInEvent
    })

    it('should call referral.finalizeReferral with user address', async () => {
      await handler.handle(event)

      expect(mockReferral.finalizeReferral).toHaveBeenCalledWith('0x1234567890123456789012345678901234567890')
    })
  })

  describe('when processing LOGGED_IN_CACHED event', () => {
    let event: LoggedInCachedEvent

    beforeEach(() => {
      event = {
        type: Events.Type.CLIENT,
        subType: Events.SubType.Client.LOGGED_IN_CACHED,
        metadata: {
          userAddress: '0x9876543210987654321098765432109876543210'
        }
      } as LoggedInCachedEvent
    })

    it('should call referral.finalizeReferral with user address', async () => {
      await handler.handle(event)

      expect(mockReferral.finalizeReferral).toHaveBeenCalledWith('0x9876543210987654321098765432109876543210')
    })
  })

  describe('and user address is missing', () => {
    let event: LoggedInEvent

    beforeEach(() => {
      event = {
        type: Events.Type.CLIENT,
        subType: Events.SubType.Client.LOGGED_IN,
        metadata: {
          userAddress: undefined as any
        }
      } as LoggedInEvent
    })

    it('should return without calling referral', async () => {
      await handler.handle(event)

      expect(mockReferral.finalizeReferral).not.toHaveBeenCalled()
    })
  })

  describe('and referral.finalizeReferral throws an error', () => {
    let event: LoggedInEvent

    beforeEach(() => {
      event = {
        type: Events.Type.CLIENT,
        subType: Events.SubType.Client.LOGGED_IN,
        metadata: {
          userAddress: '0x1234567890123456789012345678901234567890'
        }
      } as LoggedInEvent
      mockReferral.finalizeReferral.mockRejectedValueOnce(new Error('Referral error'))
    })

    it('should throw', async () => {
      await expect(handler.handle(event)).rejects.toThrow('Referral error')
    })
  })
})
