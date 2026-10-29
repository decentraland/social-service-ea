/** Thrown by admitSubscription when an address starts subscriptions faster than its budget allows. */
export class SubscriptionRateLimitedError extends Error {
  constructor() {
    super('Subscription rate exceeded; retry with backoff')
    this.name = 'SubscriptionRateLimitedError'
  }
}
