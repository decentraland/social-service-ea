import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'

import { AppComponents } from '../../types/system'
import { IMessageConsumerComponent } from './types'

// TODO: move to core-components
export function createMessagesConsumerComponent(
  components: Pick<AppComponents, 'logs' | 'queue' | 'messageProcessor'>
): IMessageConsumerComponent {
  const { logs, queue, messageProcessor } = components
  const logger = logs.getLogger('messages-consumer')

  let isRunning: boolean = false
  let processLoopPromise: Promise<void> | null = null
  let lastPullAt: number = 0

  async function removeMessageFromQueue(messageHandle: string) {
    await queue.deleteMessage(messageHandle)
  }

  async function processLoop() {
    logger.info('Starting to listen messages from queue')
    isRunning = true
    while (isRunning) {
      const messages = await queue.receiveMessages(10)
      lastPullAt = Date.now()

      for (const message of messages) {
        const { Body, ReceiptHandle } = message
        let parsedMessage: any | undefined

        try {
          parsedMessage = JSON.parse(Body!)

          if (!parsedMessage) {
            logger.warn('Message is not a valid event or could not be parsed', { parsedMessage })
            await removeMessageFromQueue(ReceiptHandle!)
            continue
          }
        } catch (error: any) {
          logger.error('Failed while parsing message from queue', {
            messageHandle: ReceiptHandle!,
            error: error?.message || 'Unexpected failure'
          })
          await removeMessageFromQueue(ReceiptHandle!)
          continue
        }

        try {
          await messageProcessor.processMessage(parsedMessage)

          await removeMessageFromQueue(ReceiptHandle!)
        } catch (error: any) {
          logger.error('Failed while processing message from queue', {
            messageHandle: ReceiptHandle!,
            entityId: parsedMessage?.key || 'unknown',
            error: error?.message || 'Unexpected failure'
          })
          logger.debug('Failed while processing message from queue', {
            stack: JSON.stringify(error?.stack)
          })
          // TODO: Add a retry mechanism OR DLQ
          await removeMessageFromQueue(ReceiptHandle!)
        }
      }
    }
  }

  async function start() {
    logger.info('Starting messages consumer component')
    isRunning = true

    // Start the processing loop in the background
    processLoopPromise = processLoop()

    // Return immediately to not block other components
    return Promise.resolve()
  }

  async function stop() {
    logger.info('Stopping messages consumer component')
    isRunning = false

    if (processLoopPromise) {
      await processLoopPromise
      processLoopPromise = null
    }
  }

  function getStatus() {
    return {
      isRunning,
      lastPullAt
    }
  }

  return {
    [START_COMPONENT]: start,
    [STOP_COMPONENT]: stop,
    getStatus
  }
}
