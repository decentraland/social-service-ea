# WebSocket Updates System

## Overview

This document explains how to implement new WebSocket updates in the social service. The system uses a pub/sub pattern with Redis for internal communication and RPC for client-server communication.

## Quick Start

To add a new WebSocket update type:

1. Define your channel in `pubsub.ts`
2. Create your handler in `updates.ts`
3. Create your RPC service in `rpc-server/services/`
4. Register your components in `rpc-server.ts`

See the detailed sections below for implementation details.

## Implementation Steps

### 1. Define Your Channel

```typescript
// src/adapters/pubsub.ts
export const YOUR_UPDATES_CHANNEL = 'your.updates.channel'
```

### 2. Create Your Handler

These handlers are in charge of:

- Receiving updates from Redis and forward them to the right users (filter)
- Making sure users get updates when they connect and stop getting them when they disconnect

```typescript
// src/logic/updates.ts
export function yourUpdateHandler(subscribersContext: ISubscribersContext, logger: ILogger) {
  return handleUpdate<'yourUpdate'>(async (update) => {
    // Example: Notify the target user of the update
    const updateEmitter = subscribersContext.getOrAddSubscriber(update.targetAddress)
    if (updateEmitter) {
      updateEmitter.emit('yourUpdate', update)
    }
  }, logger)
}
```

### 3. Create Your RPC Service

These services are in charge of:

- Creating a connection between the server and the client
- Sending updates to the client when they happen
- Cleaning up the connection when the client disconnects

```typescript
// src/adapters/rpc-server/services/subscribe-to-your-updates.ts
export function subscribeToYourUpdatesService({
  components: { logs, catalystClient }
}: RPCServiceContext<'logs' | 'catalystClient'>) {
  const logger = logs.getLogger('subscribe-to-your-updates-service')

  return async function* (_request: Empty, context: RpcServerContext) {
    let cleanup: (() => void) | undefined

    try {
      cleanup = yield* handleSubscriptionUpdates({
        rpcContext: context,
        eventName: 'yourUpdate',
        components: { catalystClient, logger },
        getAddressFromUpdate: (update) => update.targetAddress,
        shouldHandleUpdate: (update) => update.targetAddress !== context.address,
        parser: parseYourUpdate
      })
    } catch (error) {
      logger.error('Error in your updates subscription:', error)
      throw error
    } finally {
      logger.info('Closing your updates subscription')
      cleanup?.()
    }
  }
}
```

### 4. Register Your Components

This is where we wire everything together:

- Tell the server about our new update service
- Connect the handler to listen for updates
- Set up the channel to receive updates

```typescript
// src/adapters/rpc-server/rpc-server.ts
const serviceCreators = {
  subscribeToYourUpdates: {
    creator: subscribeToYourUpdatesService({ components: { logs, catalystClient } }),
    type: ServiceType.STREAM, // Use STREAM for continuous updates (like status changes)
    event: 'your_updates'
  }
}

// In start() function
await pubsub.subscribeToChannel(YOUR_UPDATES_CHANNEL, yourUpdateHandler(subscribersContext, logger))
```

#### Service Types:

- STREAM: Used for continuous updates that need to be streamed to the client
  (e.g., friendship status changes, connectivity updates)
- CALL: Used for one-time responses that complete immediately
  (e.g., getting friend list, checking block status)

## Core Concepts

### Subscribers Context

The `subscribers-context.ts` keeps track of all connected users and their event emitters:

- Each user gets their own event emitter when they connect
- The emitter is used to send updates to that specific user
- When a user disconnects, their emitter is cleaned up

```typescript
// Example of how it works
const emitter = subscribersContext.getOrAddSubscriber(userAddress)
emitter.emit('someUpdate', update) // This update goes only to this user
```

### Event to Generator

The `emitterToGenerator.ts` is a utility that turns event emitters into async generators:

- It takes an event emitter and an event type
- Returns an async generator that yields values when events happen
- This is what allows RPC services to stream updates to clients

```typescript
// Example of how it works
const updates = emitterToAsyncGenerator(emitter, 'someUpdate')
for await (const update of updates) {
  // This code runs each time an update happens
}
```

### Update Flow

1. **Internal Update Publishing**

   ```typescript
   await pubsub.publishInChannel(YOUR_UPDATES_CHANNEL, {
     // Your update payload
   })
   ```

2. **Update Processing**

   - Redis pub/sub delivers update to all server instances
   - Handler receives and parses the update
   - Addresses are normalized for consistent comparison
   - Update is filtered through shouldHandleUpdate
   - If needed, user profiles are retrieved
   - Updates are emitted to relevant subscribers

3. **Client Delivery**
   - RPC service receives update through subscription
   - Update is parsed and validated
   - Update is streamed to connected clients

## Example: Community Member Status Updates

This example shows how to implement status updates for community members, including:

- Handling member join/leave events
- Managing connectivity status
- Broadcasting updates to relevant members

1. **Channel Definition** (In pubsub.ts)

```typescript
export const COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL = 'community.member.connectivity.updates'
```

2. **Handlers** (In updates.ts)

```typescript
// Join handler
communityMemberJoinHandler() {
  return handleUpdate<'communityMemberConnectivityUpdate'>(async (update) => {
    if (update.status !== ConnectivityStatus.ONLINE) return
    // Notify community members
  })
}

// Leave handler
communityMemberLeaveHandler() {
  return handleUpdate<'communityMemberConnectivityUpdate'>(async (update) => {
    if (update.status !== ConnectivityStatus.OFFLINE) return
    // Notify community members
  })
}
```

3. **RPC Service** (In rpc-server/services)

```typescript
subscribeToCommunityMemberConnectivityUpdates() {
  return async function* (_request: Empty, context: RpcServerContext) {
    yield* handleSubscriptionUpdates({
      rpcContext: context,
      eventName: 'communityMemberConnectivityUpdate',
      // ... configuration
    })
  }
}
```

## Complete Real-Time Flow

### Connection Setup

1. Client connects through WebSocket
2. RPC Server attaches transport
3. Server subscribes to:
   - Redis channels for updates
   - NATS for peer events

### Update Types and Flow

#### Friendship Updates

1. Client sends friend request
2. Server:
   - Creates friendship record
   - Records the action
   - Publishes update to Redis
3. All connected clients receive the update

#### Connectivity Status

1. When a peer connects/disconnects:
   - NATS publishes the event
   - Redis broadcasts the update
   - Server:
     - Gets cached peers
     - Queries online friends
     - Streams status to connected friends

#### Block System

1. When a user blocks another:
   - Server creates block record
   - Updates friendship status
   - Publishes block update
2. Connected clients receive the update

### Cleanup

When a client disconnects:

1. WebSocket connection closes
2. RPC Server detaches transport
3. Server:
   - Removes the user's event emitter from subscribersContext
   - Unsubscribes from Redis channels
   - Unsubscribes from NATS
   - Cleans up any pending subscriptions
   - Releases any held resources
