import { ILoggerComponent } from '@well-known-components/interfaces'
import { IDatabaseComponent, RpcServerContext, SubscriptionEventsEmitter } from '../types'

type ILogger = ILoggerComponent.ILogger
type SharedContext = Pick<RpcServerContext, 'subscribers'>
type UpdateHandler<T extends keyof SubscriptionEventsEmitter> = (
  update: SubscriptionEventsEmitter[T]
) => void | Promise<void>

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
