import mitt, { Emitter } from 'mitt'
import { ISubscribersContext, Subscribers, SubscriptionEventsEmitter } from '../../types'

export function createSubscribersContext(): ISubscribersContext {
  const subscribers: Subscribers = {}

  return {
    getSubscribers: () => subscribers,
    getSubscribersAddresses: () => Object.keys(subscribers),
    getSubscriber: (address: string) => subscribers[address] || mitt<SubscriptionEventsEmitter>(),
    addSubscriber: (address: string, subscriber: Emitter<SubscriptionEventsEmitter>) => {
      if (!subscribers[address]) {
        subscribers[address] = subscriber
      }
    },
    removeSubscriber: (address: string) => {
      if (subscribers[address]) {
        subscribers[address].all.clear()
        delete subscribers[address]
      }
    }
  }
}
