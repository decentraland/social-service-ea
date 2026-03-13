import { Events } from '@dcl/schemas'
import { IPublisherComponent } from '@dcl/sns-component'
import { createSNSMockedComponent, createLogsMockedComponent } from '../../../mocks/components'
import { createBanEvent, createWarningEvent, publishModerationEvent } from '../../../../src/logic/user-moderation/events'
import { UserBan, UserWarning } from '../../../../src/logic/user-moderation/types'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { makeBan, makeWarning } from './utils'

describe('user-moderation events', () => {
  describe('createBanEvent', () => {
    describe('when creating a ban event without expiration or custom message', () => {
      let ban: UserBan
      let result: ReturnType<typeof createBanEvent>

      beforeEach(() => {
        ban = makeBan()
        result = createBanEvent(ban)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should set the event type to MODERATION', () => {
        expect(result.type).toBe(Events.Type.MODERATION)
      })

      it('should set the subType to USER_BAN_CREATED', () => {
        expect(result.subType).toBe(Events.SubType.Moderation.USER_BAN_CREATED)
      })

      it('should set the key to the ban id', () => {
        expect(result.key).toBe(ban.id)
      })

      it('should include the ban id in the metadata', () => {
        expect(result.metadata.id).toBe(ban.id)
      })

      it('should include the bannedAddress in the metadata', () => {
        expect(result.metadata.bannedAddress).toBe(ban.bannedAddress)
      })

      it('should include the bannedBy in the metadata', () => {
        expect(result.metadata.bannedBy).toBe(ban.bannedBy)
      })

      it('should include the reason in the metadata', () => {
        expect(result.metadata.reason).toBe(ban.reason)
      })

      it('should include the bannedAt timestamp in the metadata', () => {
        expect(result.metadata.bannedAt).toBe(ban.bannedAt.getTime())
      })

      it('should set expiresAt to null in the metadata', () => {
        expect(result.metadata.expiresAt).toBeNull()
      })

      it('should not include customMessage in the metadata', () => {
        expect(result.metadata).not.toHaveProperty('customMessage')
      })
    })

    describe('when creating a ban event with an expiration date', () => {
      let ban: UserBan
      let result: ReturnType<typeof createBanEvent>

      beforeEach(() => {
        ban = makeBan({ expiresAt: new Date('2025-12-31T00:00:00.000Z') })
        result = createBanEvent(ban)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should include the expiresAt timestamp in the metadata', () => {
        expect(result.metadata.expiresAt).toBe(ban.expiresAt!.getTime())
      })
    })

    describe('when creating a ban event with a custom message', () => {
      let ban: UserBan
      let result: ReturnType<typeof createBanEvent>

      beforeEach(() => {
        ban = makeBan({ customMessage: 'You have been banned for misconduct' })
        result = createBanEvent(ban)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should include the customMessage in the metadata', () => {
        expect(result.metadata.customMessage).toBe('You have been banned for misconduct')
      })
    })
  })

  describe('createWarningEvent', () => {
    describe('when creating a warning event', () => {
      let warning: UserWarning
      let result: ReturnType<typeof createWarningEvent>

      beforeEach(() => {
        warning = makeWarning()
        result = createWarningEvent(warning)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should set the event type to MODERATION', () => {
        expect(result.type).toBe(Events.Type.MODERATION)
      })

      it('should set the subType to USER_WARNING_CREATED', () => {
        expect(result.subType).toBe(Events.SubType.Moderation.USER_WARNING_CREATED)
      })

      it('should set the key to the warning id', () => {
        expect(result.key).toBe(warning.id)
      })

      it('should include the warning id in the metadata', () => {
        expect(result.metadata.id).toBe(warning.id)
      })

      it('should include the warnedAddress in the metadata', () => {
        expect(result.metadata.warnedAddress).toBe(warning.warnedAddress)
      })

      it('should include the warnedBy in the metadata', () => {
        expect(result.metadata.warnedBy).toBe(warning.warnedBy)
      })

      it('should include the reason in the metadata', () => {
        expect(result.metadata.reason).toBe(warning.reason)
      })

      it('should include the warnedAt timestamp in the metadata', () => {
        expect(result.metadata.warnedAt).toBe(warning.warnedAt.getTime())
      })
    })
  })

  describe('publishModerationEvent', () => {
    let mockSns: jest.Mocked<IPublisherComponent>
    let mockLogger: jest.Mocked<ILoggerComponent.ILogger>

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('when publishing a moderation event successfully', () => {
      let ban: UserBan
      let event: ReturnType<typeof createBanEvent>

      beforeEach(() => {
        mockSns = createSNSMockedComponent({ publishMessage: jest.fn().mockResolvedValueOnce(undefined) })
        mockLogger = createLogsMockedComponent({}).getLogger('test') as jest.Mocked<ILoggerComponent.ILogger>
        ban = makeBan()
        event = createBanEvent(ban)
      })

      it('should publish the event via SNS', async () => {
        await publishModerationEvent(mockSns, event, mockLogger)
        expect(mockSns.publishMessage).toHaveBeenCalledWith(event)
      })
    })

    describe('when publishing a moderation event fails after all retries', () => {
      let warning: UserWarning
      let event: ReturnType<typeof createWarningEvent>

      beforeEach(() => {
        mockSns = createSNSMockedComponent({
          publishMessage: jest.fn().mockRejectedValue(new Error('SNS unavailable'))
        })
        mockLogger = createLogsMockedComponent({}).getLogger('test') as jest.Mocked<ILoggerComponent.ILogger>
        warning = makeWarning()
        event = createWarningEvent(warning)
      })

      it('should log an error with the event details', async () => {
        await publishModerationEvent(mockSns, event, mockLogger)
        expect(mockLogger.error).toHaveBeenCalledWith('Failed to publish moderation event', {
          error: expect.any(String),
          subType: event.subType,
          key: event.key
        })
      })

      it('should not throw', async () => {
        await expect(publishModerationEvent(mockSns, event, mockLogger)).resolves.toBeUndefined()
      })
    })
  })
})
