import { ILoggerComponent } from '@well-known-components/interfaces'
import { ICatalystClientComponent, IDatabaseComponent, RpcServerContext, SubscriptionEventsEmitter } from '../types'
import mitt from 'mitt'
import emitterToAsyncGenerator from '../utils/emitterToGenerator'

export type ILogger = ILoggerComponent.ILogger

type SharedContext = Pick<RpcServerContext, 'subscribers'>
type UpdateHandler<T extends keyof SubscriptionEventsEmitter> = (
  update: SubscriptionEventsEmitter[T]
) => void | Promise<void>

type UpdateParser<T, U> = (update: U, ...args: any[]) => T | null

interface SubscriptionHandlerParams<T, U> {
  rpcContext: RpcServerContext
  eventName: keyof SubscriptionEventsEmitter
  components: {
    logger: ILogger
    catalystClient: ICatalystClientComponent
  }
  getAddressFromUpdate: (update: U) => string
  shouldHandleUpdate: (update: U) => boolean
  parser: UpdateParser<T, U>
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
  return handleUpdate<'friendConnectivityUpdate'>(async (update) => {
    const friends = await db.getOnlineFriends(update.address, Object.keys(sharedContext.subscribers))

    friends.forEach(({ address: friendAddress }) => {
      const emitter = sharedContext.subscribers[friendAddress]
      if (emitter) {
        emitter.emit('friendConnectivityUpdate', update)
      }
    })
  }, logger)
}

export async function* handleSubscriptionUpdates<T, U>({
  rpcContext,
  eventName,
  components: { catalystClient, logger },
  getAddressFromUpdate,
  shouldHandleUpdate,
  parser,
  parseArgs
}: SubscriptionHandlerParams<T, U>): AsyncGenerator<T> {
  const eventEmitter = rpcContext.subscribers[rpcContext.address] || mitt<SubscriptionEventsEmitter>()

  if (!rpcContext.subscribers[rpcContext.address]) {
    rpcContext.subscribers[rpcContext.address] = eventEmitter
  }

  const updatesGenerator = emitterToAsyncGenerator(eventEmitter, eventName)

  for await (const update of updatesGenerator) {
    const eventNameString = String(eventName)

    if (!shouldHandleUpdate(update as U)) {
      logger.debug(`Skipping update ${eventNameString} for ${rpcContext.address}`, { update: JSON.stringify(update) })
      continue
    }

    const profile = await catalystClient.getEntityByPointer(getAddressFromUpdate(update as U))
    const parsedUpdate = await parser(update as U, profile, ...parseArgs)

    if (parsedUpdate) {
      yield parsedUpdate
    } else {
      logger.error(`Unable to parse ${eventNameString}:`, { update: JSON.stringify(update) })
    }
  }
}
