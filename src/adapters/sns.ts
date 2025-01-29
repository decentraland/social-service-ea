import { PublishCommand, PublishCommandOutput, SNSClient } from '@aws-sdk/client-sns'
import { AppComponents, IPublisherComponent } from '../types'
import { FriendshipAcceptedEvent, FriendshipRequestEvent } from '@dcl/schemas'

export async function createSnsComponent({ config }: Pick<AppComponents, 'config'>): Promise<IPublisherComponent> {
  const snsArn = await config.requireString('AWS_SNS_ARN')
  const optionalEndpoint = await config.getString('AWS_SNS_ENDPOINT')

  const client = new SNSClient({
    endpoint: optionalEndpoint ? optionalEndpoint : undefined
  })

  async function publishMessage(
    event: FriendshipRequestEvent | FriendshipAcceptedEvent
  ): Promise<PublishCommandOutput> {
    const command = new PublishCommand({
      TopicArn: snsArn,
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
    })
    return client.send(command)
  }

  return { publishMessage }
}
