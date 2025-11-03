import { Event, Events, LoggedInEvent } from '@dcl/schemas'
import { IMessageProcessorComponent, createMessageProcessorComponent, EventHandler } from '../../../src/logic/sqs'

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

  describe('when registering a new handler', () => {
    let customHandler: jest.Mock
    let handler: EventHandler

    beforeEach(() => {
      customHandler = jest.fn().mockResolvedValue(undefined)
      handler = {
        type: Events.Type.CLIENT,
        subTypes: [Events.SubType.Client.LOGGED_IN],
        handle: customHandler
      }
    })

    it('should add the handler to the handlers list', () => {
      messageProcessor.registerHandler(handler)

      expect(messageProcessor.registerHandler).toBeDefined()
    })

    describe('and processing a matching message', () => {
      let message: Event

      beforeEach(() => {
        message = {
          type: Events.Type.CLIENT,
          subType: Events.SubType.Client.LOGGED_IN,
          metadata: {
            userAddress: '0x123'
          },
          key: 'test-key',
          timestamp: Date.now()
        } as unknown as LoggedInEvent
        messageProcessor.registerHandler(handler)
      })

      it('should call both the default handler and the custom handler', async () => {
        await messageProcessor.processMessage(message)

        expect(mockReferral.finalizeReferral).toHaveBeenCalledWith('0x123')
        expect(customHandler).toHaveBeenCalledWith(message)
      })
    })
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
          type: Events.Type.CLIENT,
          subType: Events.SubType.Client.LOGGED_IN,
          metadata: {},
          key: 'test-key',
          timestamp: Date.now()
        } as unknown as LoggedInEvent
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
          type: Events.Type.CLIENT,
          subType: Events.SubType.Client.LOGGED_IN,
          metadata: {
            userAddress: '0x123'
          },
          key: 'test-key',
          timestamp: Date.now()
        } as unknown as LoggedInEvent
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
