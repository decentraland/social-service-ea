import { Event, Events, UserJoinedRoomEvent } from '@dcl/schemas'
import { ReferralProgress, ReferralProgressStatus } from '../../../src/types/referral-db.type'
import { IMessageProcessorComponent } from '../../../src/types/message-processor.type'
import { createMessageProcessorComponent } from '../../../src/logic/referral/message-processor'

describe('message-processor', () => {
  let mockLogger: any
  let mockDb: any
  let messageProcessor: IMessageProcessorComponent

  beforeEach(async () => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn()
    }

    mockDb = {
      findReferralProgress: jest.fn(),
      updateReferralProgress: jest.fn()
    }

    messageProcessor = await createMessageProcessorComponent({
      logs: { getLogger: () => mockLogger },
      referralDb: mockDb
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
        expect(mockDb.findReferralProgress).not.toHaveBeenCalled()
        expect(mockDb.updateReferralProgress).not.toHaveBeenCalled()
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

      it('should not update the referral progress', async () => {
        const result = await messageProcessor.processMessage(message)

        expect(result).toBeUndefined()
        expect(mockLogger.error).toHaveBeenCalledWith('User address not found in message', expect.any(Object))
        expect(mockDb.findReferralProgress).not.toHaveBeenCalled()
        expect(mockDb.updateReferralProgress).not.toHaveBeenCalled()
      })
    })

    describe('with valid message and no referral progress', () => {
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

      it('should not update referral status', async () => {
        mockDb.findReferralProgress.mockResolvedValueOnce([])

        const result = await messageProcessor.processMessage(message)

        expect(result).toBeUndefined()
        expect(mockDb.findReferralProgress).toHaveBeenCalledWith({
          invitedUser: '0x123',
          status: ReferralProgressStatus.SIGNED_UP
        })
        expect(mockDb.updateReferralProgress).not.toHaveBeenCalled()
      })
    })

    describe('with valid message and existing referral progress', () => {
      let referralProgress: Partial<ReferralProgress>[]
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

        referralProgress = [
          {
            referrer: '0x456',
            invited_user: '0x123',
            status: ReferralProgressStatus.SIGNED_UP
          }
        ]
      })

      it('should update referral status to TIER_GRANTED', async () => {
        mockDb.findReferralProgress.mockResolvedValueOnce(referralProgress)
        mockDb.updateReferralProgress.mockResolvedValueOnce(undefined)

        const result = await messageProcessor.processMessage(message)

        expect(result).toBeUndefined()
        expect(mockDb.findReferralProgress).toHaveBeenCalledWith({
          invitedUser: '0x123',
          status: ReferralProgressStatus.SIGNED_UP
        })
        expect(mockLogger.info).toHaveBeenCalledWith('Referral tier granted to referrer', {
          referrer: '0x456',
          invited_user: '0x123',
          status: ReferralProgressStatus.TIER_GRANTED
        })
        expect(mockDb.updateReferralProgress).toHaveBeenCalledWith('0x123', ReferralProgressStatus.TIER_GRANTED)
      })
    })
  })
})
