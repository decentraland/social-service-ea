import { Message } from '@aws-sdk/client-sqs'

export type QueueMessage = Record<string, string | number | object>

export interface IQueueComponent {
  send(message: QueueMessage): Promise<void>
  receiveMessages(amount: number): Promise<Message[]>
  deleteMessage(receiptHandle: string): Promise<void>
}
