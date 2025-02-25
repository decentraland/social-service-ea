import mitt, { Emitter } from 'mitt'
import { ISubscribersContext, Subscribers, SubscriptionEventsEmitter } from '../../types'
import { normalizeAddress } from '../../utils/address'

export function createSubscribersContext(): ISubscribersContext {
  const subscribers: Subscribers = {}

  function addSubscriber(address: string, subscriber: Emitter<SubscriptionEventsEmitter>) {
    const normalizedAddress = normalizeAddress(address)
    if (!subscribers[normalizedAddress]) {
      subscribers[normalizedAddress] = subscriber
    }
  }

  return {
    getSubscribers: () => subscribers,
    getSubscribersAddresses: () => Object.keys(subscribers).map(normalizeAddress),
    getOrAddSubscriber: (address: string) => {
      const normalizedAddress = normalizeAddress(address)

      if (!subscribers[normalizedAddress]) {
        addSubscriber(normalizedAddress, mitt<SubscriptionEventsEmitter>())
      }

      return subscribers[normalizedAddress]
    },
    addSubscriber: (address: string, subscriber: Emitter<SubscriptionEventsEmitter>) => {
      const normalizedAddress = normalizeAddress(address)
      if (!subscribers[normalizedAddress]) {
        subscribers[normalizedAddress] = subscriber
      }
    },
    removeSubscriber: (address: string) => {
      const normalizedAddress = normalizeAddress(address)
      if (subscribers[normalizedAddress]) {
        subscribers[normalizedAddress].all.clear()
        delete subscribers[normalizedAddress]
      }
    }
  }
}
