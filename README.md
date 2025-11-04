# Social Service EA

[![Coverage Status](https://coveralls.io/repos/github/decentraland/social-service-ea/badge.svg)](https://coveralls.io/github/decentraland/social-service-ea)

A microservice that handles social interactions for Decentraland, built using the Well Known Components architecture pattern.

## Quick Links

- [🌟 Features](https://github.com/decentraland/social-service-ea/wiki/Features)
- [🏗 Architecture](https://github.com/decentraland/social-service-ea/wiki/Architecture)
- [🔗 API Documentation](https://github.com/decentraland/social-service-ea/wiki/API-Documentation)
- [🚀 Getting Started](https://github.com/decentraland/social-service-ea/wiki/Getting-Started)
- [🧪 Testing](https://github.com/decentraland/social-service-ea/wiki/Testing)
- [🔄 CI/CD](https://github.com/decentraland/social-service-ea/wiki/CI-CD)

## Quick Start

### Prerequisites

- Node.js v20.x.x
- Docker and Docker Compose

#### Extra pre-requisites (optional when not using Docker Compose)

- PostgreSQL 14
- Redis 6
- NATS 2
- LocalStack (for AWS services emulation)

### Development Setup

#### Clone and install
```bash
git clone https://github.com/decentraland/social-service-ea.git
cd social-service-ea

yarn install
```

#### Environment Variables
```bash
cp .env.default .env
```

Edit the `.env` file with your configuration if needed.

#### Start services using Docker Compose
```bash
docker compose up -d --wait
```

You can see the logs of the services with:

```bash
docker compose logs -f
```

For detailed setup instructions, see [Getting Started](https://github.com/decentraland/social-service-ea/wiki/Getting-Started).

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## AI Agent Context

**Service Purpose:** Handles social interactions and relationships for Decentraland users. Manages friendships, friend requests, blocking, muting, and social connectivity status. Publishes social events to enable real-time social features in clients.

**Key Capabilities:**

- Manages friendship relationships (send/accept/reject friend requests)
- Tracks friend connectivity status (online/offline via NATS peer tracking)
- Handles user blocking and muting functionality
- Publishes friendship updates and connectivity events to PubSub channels
- Sends notifications for friendship actions (friend requests, acceptances)
- Integrates with Catalyst for profile data
- Supports Server-Sent Events (SSE) for real-time social updates

**Communication Pattern:** 
- Synchronous HTTP REST API (friendship management endpoints)
- Real-time via Server-Sent Events (SSE) for friendship/connectivity updates
- PubSub messaging (friendship updates, connectivity changes)
- Event publishing via AWS SNS (notifications)

**Technology Stack:**

- Runtime: Node.js 20+
- Language: TypeScript
- HTTP Framework: @well-known-components/http-server
- Database: PostgreSQL (friendship relationships, blocks, mutes)
- Cache: Redis (connectivity status cache)
- Message Broker: NATS (peer connectivity tracking)
- Queue/Events: AWS SNS (notification publishing)
- Component Architecture: @well-known-components (logger, metrics, http-server, pg-component, pubsub-component)

**External Dependencies:**

- Databases: PostgreSQL (friendship data, user relationships)
- Cache: Redis (peer status cache)
- Message Broker: NATS (peer connectivity events)
- Event Bus: AWS SNS (social event notifications)
- Content Server: Catalyst (profile data fetching)
- PubSub: Redis PubSub channels (real-time updates)

**Key Features:**

- Friendship lifecycle management (request → accept/reject → active friendship)
- Real-time friend connectivity updates
- Block/mute user functionality
- Community member tracking (for world/community features)
