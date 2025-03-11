import { Action } from '../../../src/types'
import { Events } from '@dcl/schemas'
import { sendNotification, shouldNotify } from '../../../src/logic/notifications'
import { mockSns } from '../../mocks/components/sns'
import { mockLogs } from '../../mocks/components'
import { createMockProfile } from '../../mocks/profile'
import { getProfileHasClaimedName, getProfileName, getProfilePictureUrl } from '../../../src/logic/profiles'

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
        key: 'request-id',
        type: Events.Type.SOCIAL_SERVICE,
        subType: Events.SubType.SocialService.FRIENDSHIP_REQUEST,
        timestamp: expect.any(Number),
        metadata: {
          requestId: 'request-id',
          sender: {
            address: '0x123',
            name: getProfileName(mockSenderProfile),
            profileImageUrl: getProfilePictureUrl(mockSenderProfile),
            hasClaimedName: getProfileHasClaimedName(mockSenderProfile)
          },
          receiver: {
            address: '0x456',
            name: getProfileName(mockReceiverProfile),
            profileImageUrl: getProfilePictureUrl(mockReceiverProfile),
            hasClaimedName: getProfileHasClaimedName(mockReceiverProfile)
          },
          message: 'Hello!'
        }
      })
    })

    it('should send friendship accepted notification', async () => {
      await sendNotification(Action.ACCEPT, mockContext, components)

      expect(mockSns.publishMessage).toHaveBeenCalledWith({
        key: 'request-id',
        type: Events.Type.SOCIAL_SERVICE,
        subType: Events.SubType.SocialService.FRIENDSHIP_ACCEPTED,
        timestamp: expect.any(Number),
        metadata: {
          requestId: 'request-id',
          sender: {
            address: '0x123',
            name: getProfileName(mockSenderProfile),
            profileImageUrl: getProfilePictureUrl(mockSenderProfile),
            hasClaimedName: getProfileHasClaimedName(mockSenderProfile)
          },
          receiver: {
            address: '0x456',
            name: getProfileName(mockReceiverProfile),
            profileImageUrl: getProfilePictureUrl(mockReceiverProfile),
            hasClaimedName: getProfileHasClaimedName(mockReceiverProfile)
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
        key: 'request-id',
        type: Events.Type.SOCIAL_SERVICE,
        subType: Events.SubType.SocialService.FRIENDSHIP_REQUEST,
        timestamp: expect.any(Number),
        metadata: {
          requestId: 'request-id',
          sender: {
            address: '0x123',
            name: getProfileName(mockSenderProfile),
            profileImageUrl: getProfilePictureUrl(mockSenderProfile),
            hasClaimedName: getProfileHasClaimedName(mockSenderProfile)
          },
          receiver: {
            address: '0x456',
            name: getProfileName(mockReceiverProfile),
            profileImageUrl: getProfilePictureUrl(mockReceiverProfile),
            hasClaimedName: getProfileHasClaimedName(mockReceiverProfile)
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
