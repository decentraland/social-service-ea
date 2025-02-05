import { PublishCommand, PublishCommandOutput, SNSClient } from '@aws-sdk/client-sns'
import { createSnsComponent } from '../../../src/adapters/sns'
import { mockConfig } from '../../mocks/components'
import { Events, FriendshipAcceptedEvent, FriendshipRequestEvent } from '@dcl/schemas'

jest.mock('@aws-sdk/client-sns', () => ({
  ...jest.requireActual('@aws-sdk/client-sns'),
  SNSClient: jest.fn().mockReturnValue({
    send: jest.fn()
  })
}))

describe('SNS Component', () => {
  let mockClient: jest.Mocked<SNSClient>

  const mockRequestEvent: FriendshipRequestEvent = {
    key: `${Events.Type.SOCIAL_SERVICE}-${Events.SubType.SocialService.FRIENDSHIP_REQUEST}`,
    type: Events.Type.SOCIAL_SERVICE,
    subType: Events.SubType.SocialService.FRIENDSHIP_REQUEST,
    timestamp: Date.now(),
    metadata: {
      requestId: 'requestId',
      sender: {
        address: '0x123',
        name: 'John Doe',
        profileImageUrl: 'https://example.com/profile.png',
        hasClaimedName: true
      },
      receiver: {
        address: '0x456',
        name: 'Jane Doe',
        profileImageUrl: 'https://example.com/profile.png',
        hasClaimedName: true
      },
      message: 'Hello!'
    }
  }

  const mockAcceptedEvent: FriendshipAcceptedEvent = {
    key: `${Events.Type.SOCIAL_SERVICE}-${Events.SubType.SocialService.FRIENDSHIP_ACCEPTED}`,
    type: Events.Type.SOCIAL_SERVICE,
    subType: Events.SubType.SocialService.FRIENDSHIP_ACCEPTED,
    timestamp: Date.now(),
    metadata: {
      requestId: 'requestId',
      sender: {
        address: '0x123',
        name: 'John Doe',
        profileImageUrl: 'https://example.com/profile.png',
        hasClaimedName: true
      },
      receiver: {
        address: '0x456',
        name: 'Jane Doe',
        profileImageUrl: 'https://example.com/profile.png',
        hasClaimedName: true
      }
    }
  }

  beforeEach(() => {
    mockClient = new SNSClient({}) as jest.Mocked<SNSClient>
  })

  describe('createSnsComponent', () => {
    it('should create an SNS component with required configuration', async () => {
      mockConfig.requireString.mockResolvedValueOnce('arn:aws:sns:region:account:topic')
      mockConfig.getString.mockResolvedValueOnce(undefined)

      const snsComponent = await createSnsComponent({ config: mockConfig })

      expect(SNSClient).toHaveBeenCalledWith({
        endpoint: undefined
      })
      expect(snsComponent).toHaveProperty('publishMessage')
    })

    it('should create an SNS component with custom endpoint', async () => {
      mockConfig.requireString.mockResolvedValueOnce('arn:aws:sns:region:account:topic')
      mockConfig.getString.mockResolvedValueOnce('http://localhost:4566')

      await createSnsComponent({ config: mockConfig })

      expect(SNSClient).toHaveBeenCalledWith({
        endpoint: 'http://localhost:4566'
      })
    })
  })

  describe('publishMessage', () => {
    it.each([
      ['friendship request', mockRequestEvent],
      ['friendship accepted', mockAcceptedEvent]
    ])('should publish %s events', async (_, event) => {
      mockConfig.requireString.mockResolvedValueOnce('arn:aws:sns:region:account:topic')
      mockConfig.getString.mockResolvedValueOnce(undefined)
      mockClient.send = jest.fn().mockResolvedValueOnce({ MessageId: '123' })

      const snsComponent = await createSnsComponent({ config: mockConfig })

      await snsComponent.publishMessage(event)

      expect(mockClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TopicArn: 'arn:aws:sns:region:account:topic',
            Message: JSON.stringify(event),
            MessageAttributes: {
              type: {
                DataType: 'String',
                StringValue: event.type
              },
              subType: {
                DataType: 'String',
                StringValue: event.subType
              }
            }
          }
        })
      )
    })

    it('should handle SNS publish errors', async () => {
      mockConfig.requireString.mockResolvedValueOnce('arn:aws:sns:region:account:topic')
      mockConfig.getString.mockResolvedValueOnce(undefined)

      const error = new Error('SNS publish error')
      mockClient.send = jest.fn().mockRejectedValueOnce(error)

      const snsComponent = await createSnsComponent({ config: mockConfig })

      await expect(snsComponent.publishMessage(mockRequestEvent)).rejects.toThrow('SNS publish error')
    })
  })
})
