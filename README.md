# EA Social Service

[![Coverage Status](https://coveralls.io/repos/github/decentraland/social-service-ea/badge.svg)](https://coveralls.io/github/decentraland/social-service-ea)

A microservice that handles social interactions (friendships) for Decentraland, built using the Well Known Components architecture pattern.

## Table of Contents

- [🌟 Features](#-features)
- [🏗 Architecture](#-architecture)
  - [Component-Based Architecture](#component-based-architecture)
  - [Database Design](#database-design)
  - [Flow Diagrams](#flow-diagrams)
- [🚀 Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Environment Variables](#environment-variables)
- [🧪 Testing](#-testing)
  - [Test Coverage](#test-coverage)
- [🔄 CI/CD](#-ci/cd)
  - [Deployment Environments](#deployment-environments)

## 🌟 Features

- Friendship management (requests, accepts, rejects, cancellations)
- Real-time friend status updates
- Mutual friends discovery
- Online status tracking
- Integration with Archipelago for peer synchronization

## 🏗 Architecture

### Component-Based Architecture

This service follows the Well Known Components pattern, where each component is a self-contained unit with a clear interface. The main components are:

- **Database (PostgreSQL)**: Stores friendship relationships and actions
- **Cache (Redis)**: Handles temporary information, real-time status, and frequently accessed data
- **RPC Server**: Manages client-server RPC communication following the [Protocol definition](https://github.com/decentraland/protocol/blob/main/proto/decentraland/social_service/v2/social_service_v2.proto)
- **PubSub**: Handles real-time updates
- **Archipelago Stats**: Integrates with Decentraland's peer discovery system
- **Peer Tracking**: Monitors online status of users through the NATS messaging system
- **Catalyst Client**: Fetches profiles from the Catalyst Lambdas API
- **Peers Synchronization**: Synchronizes peers with the Archipelago Stats service and store them in Redis

### Database Design

```
erDiagram
  FRIENDSHIPS {
    uuid id PK
    varchar address_requester
    varchar address_requested
    boolean is_active
    timestamp created_at
    timestamp updated_at
  }
  FRIENDSHIP_ACTIONS {
    uuid id PK
    uuid friendship_id FK
    varchar action
    varchar acting_user
    jsonb metadata
    timestamp timestamp
  }

  FRIENDSHIPS ||--o{ FRIENDSHIP_ACTIONS : "has"
```

The database schema supports:

- Bidirectional friendships
- Action history tracking
- Metadata for requests
- Optimized queries with proper indexes

See migrations for details: [migrations](./src/migrations)

### Flow Diagrams

```mermaid
sequenceDiagram
  participant Client
  participant WebSocket
  participant RPC Server
  participant Redis
  participant NATS
  participant DB

  Note over Client,DB: Connection Setup
  Client->>WebSocket: WS Handshake
  activate WebSocket
  WebSocket-->>Client: Connection Established
  Client->>WebSocket: Auth Message
  WebSocket->>RPC Server: Attach Transport
  activate RPC Server

  Note over RPC Server,NATS: Subscriptions Setup
  RPC Server->>Redis: Subscribe to updates channels
  activate Redis
  Note over Redis: friendship.updates
  Note over Redis: friend.status.updates
  RPC Server->>NATS: Subscribe to peer events
  activate NATS
  Note over NATS: peer.*.connected
  Note over NATS: peer.*.disconnected
  Note over NATS: peer.*.heartbeat

  Note over Client,DB: Friendship Requests
  Client->>RPC Server: Friend Request
  RPC Server->>DB: Create Friendship Record
  DB-->>RPC Server: Friendship Created
  RPC Server->>DB: Record Friendship Action
  RPC Server->>Redis: Publish Friendship Update
  RPC Server-->>Client: Request Confirmation

  loop Friendship Status Updates
    Redis-->>RPC Server: Friendship Update
    RPC Server-->>Client: Stream Friendship Updates
    Note over RPC Server: (accept/cancel/reject/delete)
  end

  Note over Client,DB: Friends Connectivity Status
  loop connectivity updates
    NATS-->>Redis: Publish Peer Connection/Disconnection Update
    Redis-->>RPC Server: Broadcast Friend Connectivity Status Update
    RPC Server->>Redis: Get Cached Peers
    Redis-->>RPC Server: Cached Peers
    RPC Server->>DB: Query Online Friends
    DB-->>RPC Server: Online Friends
    RPC Server-->>Client: Stream Friend Connectivity Status to Connected Friends
    Note over RPC Server: (online/offline)
  end
  loop friendship accepted
    Redis-->>RPC Server: Friendship Accepted
    RPC Server-->>Client: Stream Friend Connectivity Status Update to both friends
  end

  Note over Client,DB: Cleanup
  Client->>WebSocket: Connection Close
  WebSocket->>RPC Server: Detach Transport
  RPC Server->>Redis: Unsubscribe
  RPC Server->>NATS: Unsubscribe
  deactivate WebSocket
  deactivate RPC Server
  deactivate Redis
  deactivate NATS
```

## 🚀 Getting Started

### Prerequisites

- Node.js v18.20.4
- Docker and Docker Compose
- PostgreSQL
- Redis

### Local Development

1. Clone the repository
2. Install dependencies:

```bash
yarn install
```

3. Start the development environment:

```bash
docker-compose up -d
```

4. Run migrations:

```bash
yarn migrate up
```

5. Run the service:

```bash
yarn dev
```

### Environment Variables

Key environment variables needed:

- `REDIS_HOST`: URL of the Redis instance
- `RPC_SERVER_PORT`: Port of the RPC server
- `PG_COMPONENT_PSQL_CONNECTION_STRING`: URL of the PostgreSQL instance
- `ARCHIPELAGO_STATS_URL`: URL of the Archipelago Stats service
- `NATS_URL`: URL of the NATS instance
- `CATALYST_LAMBDAS_URL_LOADBALANCER`: URL of the Catalyst Lambdas Load Balancer
- `PEER_SYNC_INTERVAL_MS`: Interval for peer synchronization
- `PEERS_SYNC_CACHE_TTL_MS`: Cache TTL for peer synchronization

See `.env.default` for all available options.

## 🧪 Testing

The project uses Jest for testing. Run tests with:

```bash
yarn test
```

### Test Coverage

Coverage reports are generated in the `/coverage` directory and uploaded to Coveralls.

## 🔄 CI/CD

The project uses GitHub Actions for:

- Continuous Integration
- Docker image building
- Automated deployments to dev/prod environments
- Dependency management with Dependabot

### Deployment Environments

- **Development**: Automatic deployments on main branch
- **Production**: Manual deployments via GitHub releases
