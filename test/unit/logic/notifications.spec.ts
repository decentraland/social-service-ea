import { Action } from '../../../src/types'
import { Events } from '@dcl/schemas'
import { sendNotification, shouldNotify } from '../../../src/logic/notifications'
import { mockSns } from '../../mocks/components/sns'
import { mockLogs } from '../../mocks/components'
import { createMockProfile } from '../../mocks/profile'

describe('Notifications', () => {
  const mockSenderProfile = createMockProfile('0x123')
  const mockReceiverProfile = createMockProfile('0x456')

  const mockContext = {
    requestId: 'request-id',
    senderAddress: '0x123',
    receiverAddress: '0x456',
    senderProfile: mockSenderProfile,
    receiverProfile: mockReceiverProfile,
    profile: mockReceiverProfile,
    profileImagesUrl: 'http://test.com/images',
    message: 'Hello!'
  }

  describe('shouldNotify', () => {
    it.each([Action.REQUEST, Action.ACCEPT])('should return true for %s action', (action) => {
      expect(shouldNotify(action)).toBe(true)
    })

    it.each([Action.CANCEL, Action.REJECT, Action.DELETE])('should return false for %s action', (action) => {
      expect(shouldNotify(action)).toBe(false)
    })
  })

  describe('sendNotification', () => {
    const components = {
      sns: mockSns,
      logs: mockLogs
    }

    it('should send friendship request notification', async () => {
      await sendNotification(Action.REQUEST, mockContext, components)

      expect(mockSns.publishMessage).toHaveBeenCalledWith({
        key: `0x123-0x456-${Events.Type.SOCIAL_SERVICE}-${Events.SubType.SocialService.FRIENDSHIP_REQUEST}`,
        type: Events.Type.SOCIAL_SERVICE,
        subType: Events.SubType.SocialService.FRIENDSHIP_REQUEST,
        timestamp: expect.any(Number),
        metadata: {
          requestId: 'request-id',
          sender: {
            address: '0x123',
            name: mockSenderProfile.metadata.avatars[0].name,
            profileImageUrl: 'http://test.com/images/0x123',
            hasClaimedName: mockSenderProfile.metadata.avatars[0].hasClaimedName
          },
          receiver: {
            address: '0x456',
            name: mockReceiverProfile.metadata.avatars[0].name,
            profileImageUrl: 'http://test.com/images/0x456',
            hasClaimedName: mockReceiverProfile.metadata.avatars[0].hasClaimedName
          },
          message: 'Hello!'
        }
      })
    })

    it('should send friendship accepted notification', async () => {
      await sendNotification(Action.ACCEPT, mockContext, components)

      expect(mockSns.publishMessage).toHaveBeenCalledWith({
        key: `0x123-0x456-${Events.Type.SOCIAL_SERVICE}-${Events.SubType.SocialService.FRIENDSHIP_ACCEPTED}`,
        type: Events.Type.SOCIAL_SERVICE,
        subType: Events.SubType.SocialService.FRIENDSHIP_ACCEPTED,
        timestamp: expect.any(Number),
        metadata: {
          requestId: 'request-id',
          sender: {
            address: '0x123',
            name: mockSenderProfile.metadata.avatars[0].name,
            profileImageUrl: 'http://test.com/images/0x123',
            hasClaimedName: mockSenderProfile.metadata.avatars[0].hasClaimedName
          },
          receiver: {
            address: '0x456',
            name: mockReceiverProfile.metadata.avatars[0].name,
            profileImageUrl: 'http://test.com/images/0x456',
            hasClaimedName: mockReceiverProfile.metadata.avatars[0].hasClaimedName
          },
          message: 'Hello!'
        }
      })
    })

    it('should throw error if action is not valid', async () => {
      const invalidAction = 'INVALID_ACTION' as any

      await expect(sendNotification(invalidAction, mockContext, components)).rejects.toThrow(
        `Invalid action: ${invalidAction}`
      )

      expect(mockSns.publishMessage).not.toHaveBeenCalled()
    })

    it('should send notification without message when no message is provided', async () => {
      const contextWithoutMessage = {
        ...mockContext,
        message: undefined
      }

      await sendNotification(Action.REQUEST, contextWithoutMessage, components)

      expect(mockSns.publishMessage).toHaveBeenCalledWith({
        key: `0x123-0x456-${Events.Type.SOCIAL_SERVICE}-${Events.SubType.SocialService.FRIENDSHIP_REQUEST}`,
        type: Events.Type.SOCIAL_SERVICE,
        subType: Events.SubType.SocialService.FRIENDSHIP_REQUEST,
        timestamp: expect.any(Number),
        metadata: {
          requestId: 'request-id',
          sender: {
            address: '0x123',
            name: mockSenderProfile.metadata.avatars[0].name,
            profileImageUrl: 'http://test.com/images/0x123',
            hasClaimedName: mockSenderProfile.metadata.avatars[0].hasClaimedName
          },
          receiver: {
            address: '0x456',
            name: mockReceiverProfile.metadata.avatars[0].name,
            profileImageUrl: 'http://test.com/images/0x456',
            hasClaimedName: mockReceiverProfile.metadata.avatars[0].hasClaimedName
          }
        }
      })
    })

    describe('retry behavior', () => {
      it('should retry failed notifications and succeed eventually', async () => {
        const logger = mockLogs.getLogger('notifications')

        mockSns.publishMessage
          .mockRejectedValueOnce(new Error('First failure'))
          .mockRejectedValueOnce(new Error('Second failure'))
          .mockResolvedValueOnce(undefined)

        await sendNotification(Action.REQUEST, mockContext, components)

        expect(mockSns.publishMessage).toHaveBeenCalledTimes(3)
        expect(logger.warn).toHaveBeenCalledWith(
          'Attempt 1 failed for action request',
          expect.objectContaining({
            error: 'First failure',
            action: Action.REQUEST
          })
        )
        expect(logger.warn).toHaveBeenCalledWith(
          'Attempt 2 failed for action request',
          expect.objectContaining({
            error: 'Second failure',
            action: Action.REQUEST
          })
        )
        expect(logger.info).toHaveBeenCalledWith('Notification sent for action request', expect.any(Object))
      })

      it('should fail after all retries are exhausted', async () => {
        const logger = mockLogs.getLogger('notifications')
        const error = new Error('Persistent failure')

        mockSns.publishMessage.mockRejectedValue(error)

        await sendNotification(Action.REQUEST, mockContext, components)

        expect(mockSns.publishMessage).toHaveBeenCalledTimes(3)
        expect(logger.error).toHaveBeenCalledWith(
          'Error sending notification for action request',
          expect.objectContaining({
            error: expect.stringContaining('Failed after 3 attempts'),
            action: Action.REQUEST
          })
        )
      })
    })
  })
})
