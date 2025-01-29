import { Action } from '../../../src/types'
import { Events } from '@dcl/schemas'
import { sendNotification, shouldNotify } from '../../../src/logic/notifications'
import { mockSns } from '../../mocks/components/sns'
import { mockLogs } from '../../mocks/components'
import { createMockProfile } from '../../mocks/profile'

describe('Notifications', () => {
  const mockProfile = createMockProfile('0x123')
  const mockContext = {
    senderAddress: '0x123',
    receiverAddress: '0x456',
    profile: mockProfile,
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
          sender: {
            address: '0x123',
            name: mockProfile.metadata.avatars[0].name,
            profileImageUrl: 'http://test.com/images/0x123'
          },
          receiver: {
            address: '0x456'
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
          sender: {
            address: '0x123',
            name: mockProfile.metadata.avatars[0].name,
            profileImageUrl: 'http://test.com/images/0x123'
          },
          receiver: {
            address: '0x456'
          },
          message: 'Hello!'
        }
      })
    })

    it('should handle notification errors', async () => {
      const error = new Error('SNS error')
      mockSns.publishMessage.mockRejectedValueOnce(error)

      await expect(sendNotification(Action.REQUEST, mockContext, components)).rejects.toThrow(error)
    })
  })
})
