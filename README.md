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
- **Cache (Redis)**: Handles temporary data and real-time status
- **RPC Server**: Manages client-server RPC communication
- **PubSub**: Handles real-time updates
- **Archipelago Stats**: Integrates with Decentraland's peer discovery system
- **Peer Tracking**: Monitors online status of users through the NATS messaging system
- **Peers Synchronization**: Synchronizes peers with the Archipelago Stats service and store them in Redis

### Database Design

```plantuml
@startuml
!define table(x) class x << (T,#FFAAAA) >>
!define primary_key(x) <u>x</u>
!define foreign_key(x) #x#
hide methods
hide stereotypes

table(friendships) {
  primary_key(id): uuid
  address_requester: varchar
  address_requested: varchar
  is_active: boolean
  created_at: timestamp
  updated_at: timestamp
  --
  indexes
  ..
  hash(address_requester)
  hash(address_requested)
  btree(LOWER(address_requester))
  btree(LOWER(address_requested))
}

table(friendship_actions) {
  primary_key(id): uuid
  foreign_key(friendship_id): uuid
  action: varchar
  acting_user: varchar
  metadata: jsonb
  timestamp: timestamp
  --
  indexes
  ..
  btree(friendship_id)
}

friendships ||--|{ friendship_actions
@enduml
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
    participant RPC
    participant Redis
    participant NATS
    participant DB

    Client->>WebSocket: WS Handshake
    activate WebSocket
    WebSocket-->>Client: Connection Established

    Client->>WebSocket: Auth Message
    WebSocket->>RPC: Attach Transport
    activate RPC

    RPC->>Redis: Subscribe to channels
    activate Redis
    Note over Redis: Friend Status Updates
    Note over Redis: Friendship Updates

    RPC->>NATS: Subscribe to patterns
    activate NATS
    Note over NATS: peer.*.connected
    Note over NATS: peer.*.disconnected

    Client->>RPC: Friend Request
    RPC->>DB: Create Friendship
    DB-->>RPC: Friendship Created

    RPC->>Redis: Publish Update
    Redis-->>Client: Friend Request Event

    Note over Client,DB: Friendship Lifecycle

    NATS-->>RPC: Peer Status Update
    RPC->>Redis: Update Status
    Redis-->>Client: Status Update Event

    deactivate WebSocket
    deactivate RPC
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
yarn start
```

### Environment Variables

Key environment variables needed:

- `REDIS_HOST`: URL of the Redis instance
- `PG_COMPONENT_PSQL_CONNECTION_STRING`: URL of the PostgreSQL instance
- `ARCHIPELAGO_STATS_URL`: URL of the Archipelago Stats service

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
