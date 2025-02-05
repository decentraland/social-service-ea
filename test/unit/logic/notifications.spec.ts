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

    beforeEach(() => {
      jest.clearAllMocks()
    })

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

    it('should log notification errors', async () => {
      const error = new Error('SNS error')
      mockSns.publishMessage.mockRejectedValueOnce(error)

      await sendNotification(Action.REQUEST, mockContext, components)

      expect(mockLogs.getLogger('notifications').error).toHaveBeenCalledWith(
        `Error sending notification for action ${Action.REQUEST}`,
        {
          error: error.message,
          action: Action.REQUEST,
          senderAddress: '0x123',
          receiverAddress: '0x456'
        }
      )
    })
  })
})
