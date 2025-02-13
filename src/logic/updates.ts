import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  ICatalystClientComponent,
  IDatabaseComponent,
  ISubscribersContext,
  RpcServerContext,
  SubscriptionEventsEmitter
} from '../types'
import emitterToAsyncGenerator from '../utils/emitterToGenerator'
import { normalizeAddress } from '../utils/address'

export type ILogger = ILoggerComponent.ILogger

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
  parseArgs?: any[]
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

export function friendshipUpdateHandler(subscribersContext: ISubscribersContext, logger: ILogger) {
  return handleUpdate<'friendshipUpdate'>((update) => {
    logger.info('Friendship update', {
      update: JSON.stringify(update)
    })

    const updateEmitter = subscribersContext.getOrAddSubscriber(update.to)
    if (updateEmitter) {
      updateEmitter.emit('friendshipUpdate', update)
    }
  }, logger)
}

export function friendConnectivityUpdateHandler(
  rpcContext: ISubscribersContext,
  logger: ILogger,
  db: IDatabaseComponent
) {
  return handleUpdate<'friendConnectivityUpdate'>(async (update) => {
    const onlineSubscribers = rpcContext.getSubscribersAddresses()
    const friends = await db.getOnlineFriends(update.address, onlineSubscribers)

    logger.debug('Processing connectivity update:', {
      update: JSON.stringify(update),
      subscribersCount: onlineSubscribers.length,
      subscribers: onlineSubscribers.join(', '),
      friendsCount: friends.length,
      friends: JSON.stringify(friends)
    })

    friends.forEach(({ address: friendAddress }) => {
      const emitter = rpcContext.getOrAddSubscriber(friendAddress)
      if (emitter) {
        logger.debug('Emitting update to friend:', { friendAddress })
        emitter.emit('friendConnectivityUpdate', update)
      } else {
        logger.warn('No emitter found for friend:', { friendAddress })
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
  parseArgs = []
}: SubscriptionHandlerParams<T, U>): AsyncGenerator<T> {
  const normalizedAddress = normalizeAddress(rpcContext.address)
  const eventEmitter = rpcContext.subscribersContext.getOrAddSubscriber(normalizedAddress)
  const eventNameString = String(eventName)

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

      const profile = await catalystClient.getProfile(getAddressFromUpdate(update as U))
      const parsedUpdate = await parser(update as U, profile, ...parseArgs)

      if (parsedUpdate) {
        logger.debug(`Yielding parsed update ${eventNameString}`, { update: JSON.stringify(parsedUpdate) })
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
  } finally {
    logger.debug('Generator loop finished', {
      address: rpcContext.address,
      event: eventNameString
    })
    await updatesGenerator.return(undefined)
  }

  // Return a cleanup function
  return () => {
    logger.debug(`Cleaning up subscription for ${eventNameString}`, { address: rpcContext.address })
    void updatesGenerator.return(undefined)
  }
}
