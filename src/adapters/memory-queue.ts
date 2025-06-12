import { randomUUID } from 'node:crypto'
import { Message } from '@aws-sdk/client-sqs'
import { sleep } from '../logic/utils'
import { IQueueComponent, QueueMessage } from '../types/sqs.type'

export function createMemoryQueueAdapter(): IQueueComponent {
  const queue: Map<string, Message> = new Map()

  async function send(message: QueueMessage): Promise<void> {
    const receiptHandle = randomUUID().toString()
    queue.set(receiptHandle, {
      MessageId: randomUUID().toString(),
      ReceiptHandle: receiptHandle,
      Body: JSON.stringify({ Message: JSON.stringify(message) })
    })

    return
  }

  async function receiveMessages(amount: number = 1): Promise<Message[]> {
    await sleep(1000) // prevent blocking the main thread when using this mem-queue
    const messages = Array.from(queue.values()).slice(0, amount)
    return messages
  }

  async function deleteMessage(receiptHandle: string): Promise<void> {
    queue.delete(receiptHandle)
  }

  return { send, receiveMessages, deleteMessage }
}
