# WebSocket Updates System

## Overview
This document explains how to implement new WebSocket updates in the social service. The system uses a pub/sub pattern with Redis for internal communication and RPC for client-server communication.

## Components

### 1. PubSub Channel
```typescript
// src/adapters/pubsub.ts
export const YOUR_UPDATES_CHANNEL = 'your.updates.channel'
```

### 2. Update Handler
These handlers are in charge of:
- Receiving updates from Redis and forward them to the right users (filter)
- Making sure users get updates when they connect and stop getting them when they disconnect

```typescript
// src/logic/updates.ts
export function yourUpdateHandler(
  rpcContext: ISubscribersContext,
  logger: ILogger,
  // Add other dependencies
) {
  return handleUpdate<'yourUpdate'>(async (update) => {
    // Process update and notify relevant subscribers
    const updateEmitter = rpcContext.getOrAddSubscriber(targetAddress)
    if (updateEmitter) {
      updateEmitter.emit('yourUpdate', update)
    }
  }, logger)
}
```

### 3. RPC Service
These services are in charge of:
- Creating a connection between the server and the client
- Sending updates to the client when they happen
- Cleaning up the connection when the client disconnects

```typescript
// src/adapters/rpc-server/services/subscribe-to-your-updates.ts
export function subscribeToYourUpdatesService({
  components: { logs, catalystClient }
}: RPCServiceContext<'logs' | 'catalystClient'>) {
  return async function* (_request: Empty, context: RpcServerContext) {
    yield* handleSubscriptionUpdates({
      rpcContext: context,
      eventName: 'yourUpdate',
      components: { catalystClient, logger },
      getAddressFromUpdate: (update) => update.targetAddress,
      shouldHandleUpdate: (update) => update.targetAddress !== context.address,
      parser: parseYourUpdate
    })
  }
}
```

### 4. Register Components
This is where we wire everything together:
- Tell the server about our new update service
- Connect the handler to listen for updates
- Set up the channel to receive updates

```typescript
// src/adapters/rpc-server/rpc-server.ts
const serviceCreators = {
  subscribeToYourUpdates: {
    creator: subscribeToYourUpdatesService({ components: { logs, catalystClient } }),
    type: ServiceType.STREAM, // STREAM (yielded updates) or CALL (straight complete updates)
    event: 'your_updates'
  }
}

// In start() function
await pubsub.subscribeToChannel(
  YOUR_UPDATES_CHANNEL,
  yourUpdateHandler(subscribersContext, logger)
)
```

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
1. **Redis to Server**
   - Update is published to Redis channel
   - All server instances receive the update
   - Handler processes it and finds target users

2. **Server to Client**
   - Handler emits update to target users' emitters
   - RPC service's generator receives the update
   - Update is sent through WebSocket to client

## Flow

1. **Publishing Updates Internally** (In your action handler, _e.g: an endpoint or an RPC call_)
```typescript
// In your handler/action
await pubsub.publishInChannel(YOUR_UPDATES_CHANNEL, {
  // Your update payload
})
```

2. **Update Processing**
- Update is published to Redis channel (In Redis pub/sub system)
- Handler receives update through pubsub subscription (In the handler function created by `handleUpdate` in updates.ts)
- Handler processes update and notifies relevant subscribers (In the handler's callback function)

3. **Client Delivery**
- RPC service receives update through subscription (In `handleSubscriptionUpdates` function in updates.ts)
- Update is parsed and validated (In the parser function passed to `handleSubscriptionUpdates`)
- Update is delivered to connected clients (Through the RPC service's generator function)

## Example: Community Member Status Updates

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
3. Server unsubscribes from Redis and NATS
