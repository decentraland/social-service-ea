import { Event, Events, UserJoinedRoomEvent } from '@dcl/schemas'
import { IMessageProcessorComponent, createMessageProcessorComponent } from '../../../src/logic/sqs'

describe('message-processor', () => {
  let mockLogger: any
  let mockReferral: any
  let messageProcessor: IMessageProcessorComponent

  beforeEach(async () => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }

    mockReferral = {
      finalizeReferral: jest.fn()
    }

    messageProcessor = await createMessageProcessorComponent({
      logs: { getLogger: () => mockLogger },
      referral: mockReferral
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when processing a message', () => {
    let message: Event

    describe('with invalid message type', () => {
      beforeEach(() => {
        message = {
          type: 'INVALID_TYPE',
          subType: 'INVALID_SUBTYPE',
          key: 'test-key',
          timestamp: Date.now()
        } as unknown as Event
      })
      it('should not process message and return undefined', async () => {
        const result = await messageProcessor.processMessage(message)

        expect(result).toBeUndefined()
        expect(mockReferral.finalizeReferral).not.toHaveBeenCalled()
      })
    })

    describe('with valid message type but missing user address', () => {
      beforeEach(() => {
        message = {
          type: Events.Type.COMMS,
          subType: Events.SubType.Comms.USER_JOINED_ROOM,
          metadata: {},
          key: 'test-key',
          timestamp: Date.now()
        } as unknown as UserJoinedRoomEvent
      })

      it('should not finalize the referral', async () => {
        const result = await messageProcessor.processMessage(message)

        expect(result).toBeUndefined()
        expect(mockLogger.error).toHaveBeenCalledWith('User address not found in message', expect.any(Object))
        expect(mockReferral.finalizeReferral).not.toHaveBeenCalled()
      })
    })

    describe('with valid message and user address', () => {
      beforeEach(() => {
        message = {
          type: Events.Type.COMMS,
          subType: Events.SubType.Comms.USER_JOINED_ROOM,
          metadata: {
            userAddress: '0x123'
          },
          key: 'test-key',
          timestamp: Date.now()
        } as unknown as UserJoinedRoomEvent
      })

      it('should finalize referral and log success', async () => {
        mockReferral.finalizeReferral.mockResolvedValueOnce(undefined)

        const result = await messageProcessor.processMessage(message)

        expect(result).toBeUndefined()
        expect(mockReferral.finalizeReferral).toHaveBeenCalledWith('0x123')
      })
    })
  })
})
