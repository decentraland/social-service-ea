import { ILoggerComponent } from '@well-known-components/interfaces'
import { ICatalystClientComponent, IDatabaseComponent, RpcServerContext, SubscriptionEventsEmitter } from '../types'
import emitterToAsyncGenerator from '../utils/emitterToGenerator'
import { normalizeAddress } from '../utils/address'

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

export function friendshipUpdateHandler(getContext: () => SharedContext, logger: ILogger) {
  return handleUpdate<'friendshipUpdate'>((update) => {
    const context = getContext()
    const updateEmitter = context.subscribers[update.to]
    if (updateEmitter) {
      updateEmitter.emit('friendshipUpdate', update)
    }
  }, logger)
}

export function friendConnectivityUpdateHandler(
  getContext: () => SharedContext,
  logger: ILogger,
  db: IDatabaseComponent
) {
  return handleUpdate<'friendConnectivityUpdate'>(async (update) => {
    const context = getContext()

    const onlineSubscribers = Object.keys(context.subscribers)
    const friends = await db.getOnlineFriends(update.address, onlineSubscribers)

    friends.forEach(({ address: friendAddress }) => {
      const normalizedAddress = normalizeAddress(friendAddress)

      const emitter = context.subscribers[normalizedAddress]
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
  const normalizedAddress = normalizeAddress(rpcContext.address)
  const eventEmitter = rpcContext.subscribers[normalizedAddress]
  const eventNameString = String(eventName)

  if (!eventEmitter) {
    logger.error(`No emitter found for ${eventNameString}`, {
      address: normalizedAddress
    })
    return
  }

  const updatesGenerator = emitterToAsyncGenerator(eventEmitter, eventName)

  try {
    for await (const update of updatesGenerator) {
      logger.debug(`Generator received update for ${eventNameString}`, {
        update: JSON.stringify(update),
        address: rpcContext.address
      })

      if (!shouldHandleUpdate(update as U)) {
        logger.debug(`Skipping update ${eventNameString} for ${rpcContext.address}`, { update: JSON.stringify(update) })
        continue
      }

      const profile = await catalystClient.getEntityByPointer(getAddressFromUpdate(update as U))
      const parsedUpdate = await parser(update as U, profile, ...parseArgs)

      if (parsedUpdate) {
        yield parsedUpdate
      } else {
        logger.error(`Unable to parse ${eventNameString}`, { update: JSON.stringify(update) })
      }
    }
  } catch (error) {
    logger.error('Error in generator loop', {
      error: JSON.stringify(error),
      address: rpcContext.address,
      event: eventNameString
    })
    throw error
  }
}
