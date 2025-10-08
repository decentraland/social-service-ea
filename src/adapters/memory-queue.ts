import { randomUUID } from 'node:crypto'
import { Message } from '@aws-sdk/client-sqs'
import { sleep } from '../utils/timer'
import { IQueueComponent } from '@dcl/sqs-component'

type QueueMessage = Record<string, string | number | object>

export function createMemoryQueueAdapter(): IQueueComponent {
  const queue: Map<string, Message> = new Map()

  async function sendMessage(message: QueueMessage): Promise<void> {
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

  async function deleteMessages(receiptHandles: string[]): Promise<void> {
    receiptHandles.forEach((receiptHandle) => {
      queue.delete(receiptHandle)
    })
  }

  async function getStatus(): Promise<{
    ApproximateNumberOfMessages: string
    ApproximateNumberOfMessagesNotVisible: string
    ApproximateNumberOfMessagesDelayed: string
  }> {
    return {
      ApproximateNumberOfMessages: queue.size.toString(),
      ApproximateNumberOfMessagesNotVisible: '0',
      ApproximateNumberOfMessagesDelayed: '0'
    }
  }

  return { sendMessage, receiveMessages, deleteMessage, deleteMessages, getStatus }
}
