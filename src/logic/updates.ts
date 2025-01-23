import { ILoggerComponent } from '@well-known-components/interfaces'
import { ICatalystClientComponent, IDatabaseComponent, RpcServerContext, SubscriptionEventsEmitter } from '../types'
import { Emitter } from 'mitt'
import emitterToAsyncGenerator from '../utils/emitterToGenerator'

export type ILogger = ILoggerComponent.ILogger

type SharedContext = Pick<RpcServerContext, 'subscribers'>
type UpdateHandler<T extends keyof SubscriptionEventsEmitter> = (
  update: SubscriptionEventsEmitter[T]
) => void | Promise<void>

type UpdateParser<T, U> = (update: U, ...args: any[]) => T | null

interface SubscriptionHandlerParams<T, U> {
  eventEmitter: Emitter<SubscriptionEventsEmitter>
  eventName: keyof SubscriptionEventsEmitter
  parser: UpdateParser<T, U>
  addressGetter: (update: U) => string
  logger: ILogger
  catalystClient: ICatalystClientComponent
  parseArgs: any[]
}

function handleUpdate<T extends keyof SubscriptionEventsEmitter>(handler: UpdateHandler<T>, logger: ILogger) {
  return async (message: string) => {
    try {
      const update = JSON.parse(message) as SubscriptionEventsEmitter[T]
      await handler(update)
    } catch (error: any) {
      logger.error(`Error handling update: ${error.message}`, {
        error,
        message
      })
    }
  }
}

export function friendshipUpdateHandler(sharedContext: SharedContext, logger: ILogger) {
  return handleUpdate<'friendshipUpdate'>((update) => {
    const updateEmitter = sharedContext.subscribers[update.to]
    if (updateEmitter) {
      updateEmitter.emit('friendshipUpdate', update)
    }
  }, logger)
}

export function friendConnectivityUpdateHandler(sharedContext: SharedContext, logger: ILogger, db: IDatabaseComponent) {
  return handleUpdate<'friendStatusUpdate'>(async (update) => {
    const friends = await db.getOnlineFriends(update.address, Object.keys(sharedContext.subscribers))

    friends.forEach(({ address: friendAddress }) => {
      const emitter = sharedContext.subscribers[friendAddress]
      if (emitter) {
        emitter.emit('friendStatusUpdate', update)
      }
    })
  }, logger)
}

export async function* handleSubscriptionUpdates<T, U>({
  eventEmitter,
  eventName,
  parser,
  addressGetter,
  catalystClient,
  logger,
  parseArgs
}: SubscriptionHandlerParams<T, U>): AsyncGenerator<T> {
  const updatesGenerator = emitterToAsyncGenerator(eventEmitter, eventName)

  for await (const update of updatesGenerator) {
    const eventNameString = String(eventName)
    logger.debug(`${eventNameString} received:`, { update: JSON.stringify(update) })

    const profile = await catalystClient.getEntityByPointer(addressGetter(update as U))
    const parsedUpdate = await parser(update as U, profile, ...parseArgs)

    if (parsedUpdate) {
      yield parsedUpdate
    } else {
      logger.error(`Unable to parse ${eventNameString}:`, { update: JSON.stringify(update) })
    }
  }
}
