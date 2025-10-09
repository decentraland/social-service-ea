import {
  PublishBatchCommand,
  PublishBatchCommandOutput,
  PublishCommand,
  PublishCommandOutput,
  SNSClient
} from '@aws-sdk/client-sns'
import type { AppComponents, IPublisherComponent } from '../types'
import type { SnsEvent } from '../types/sns'

export async function createSnsComponent({ config }: Pick<AppComponents, 'config'>): Promise<IPublisherComponent> {
  const snsArn = await config.requireString('AWS_SNS_ARN')
  const optionalEndpoint = await config.getString('AWS_SNS_ENDPOINT')

  const client = new SNSClient({
    endpoint: optionalEndpoint ? optionalEndpoint : undefined
  })

  async function publishMessage(event: SnsEvent): Promise<PublishCommandOutput> {
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

  async function publishMessages(events: SnsEvent[]): Promise<PublishBatchCommandOutput> {
    const command = new PublishBatchCommand({
      TopicArn: snsArn,
      PublishBatchRequestEntries: events.map((event) => ({
        Id: `msg-${Date.now()}`,
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
      }))
    })

    return client.send(command)
  }

  return { publishMessage, publishMessages }
}
