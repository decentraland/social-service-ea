# Social Service EA

[![Coverage Status](https://coveralls.io/repos/github/decentraland/social-service-ea/badge.svg)](https://coveralls.io/github/decentraland/social-service-ea)

A microservice that handles social interactions for Decentraland, built using the Well Known Components architecture pattern. This service enables users to create and manage communities, connect with friends, participate in voice chats, and engage in social activities within the metaverse.

This server interacts with PostgreSQL for data persistence, Redis for caching, NATS for messaging, AWS S3 for media storage, and various Decentraland services (Catalyst, Places API, Comms Gatekeeper) in order to provide users with comprehensive social features and community management capabilities.

## Table of Contents

- [Features](#features)
- [Dependencies](#dependencies)
- [API Documentation](#api-documentation)
- [Database](#database)
  - [Schema](#schema)
  - [Migrations](#migrations)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the Service](#running-the-service)
- [Testing](#testing)

## Features

- **Community Management**: Create and manage communities with customizable privacy settings (public/private) and visibility (listed/unlisted)
- **Member Management**: Role-based permissions (owner, moderator, member) with invitation and join request workflows
- **Community Posts**: Share updates and announcements within communities with post likes
- **Place Associations**: Link communities with specific Decentraland locations
- **Voice Chat**: Real-time voice chat sessions within communities with role-based participation
- **Friendship Management**: Manage friend relationships and social connections
- **Privacy Controls**: Blocking and privacy settings for user interactions
- **Referral System**: Track user referrals, invitations, and referral progress
- **User Profiles**: Integration with user profiles including claimed names and avatars
- **Online Status**: Track online status for community members

## Dependencies

- **[Catalyst](https://github.com/decentraland/catalyst)**: Content server for user profiles and avatar data
- **[Places API](https://github.com/decentraland/places-api)**: Scene and place information
- **[Comms Gatekeeper](https://github.com/decentraland/comms-gatekeeper)**: Voice chat token generation
- **[Archipelago Stats](https://github.com/decentraland/archipelago-workers)**: User presence and online status
- **PostgreSQL**: Database for communities, members, posts, friendships, and social settings
- **Redis**: Caching layer for performance optimization
- **NATS**: Message broker for real-time updates and event distribution
- **AWS S3**: Media storage for community images and referral rewards
- **AWS SNS**: Event notifications for social events
- **LocalStack** (for local development): AWS services emulation

## API Documentation

The API is fully documented using the [OpenAPI standard](https://swagger.io/specification/). The schema is located at [docs/openapi.yaml](docs/openapi.yaml).

### Authentication

This API uses two authentication methods:

- **Signed Fetch (Primary)**: Most endpoints use Signed Fetch authentication (ADR-44), which cryptographically signs requests using the user's Ethereum wallet
- **Bearer Token (Admin)**: Administrative endpoints use Bearer token authentication for system-level operations

### Quick Links

- [🌟 Features](https://github.com/decentraland/social-service-ea/wiki/Features)
- [🏗 Architecture](https://github.com/decentraland/social-service-ea/wiki/Architecture)
- [🔗 API Documentation](https://github.com/decentraland/social-service-ea/wiki/API-Documentation)
- [🚀 Getting Started](https://github.com/decentraland/social-service-ea/wiki/Getting-Started)
- [🧪 Testing](https://github.com/decentraland/social-service-ea/wiki/Testing)
- [🔄 CI/CD](https://github.com/decentraland/social-service-ea/wiki/CI-CD)

## Database

### Schema

See [docs/database-schemas.md](docs/database-schemas.md) for detailed schema, column definitions, and relationships.

### Migrations

The service uses `node-pg-migrate` for database migrations. These migrations are located in `src/migrations/`. The service automatically runs the migrations when starting up.

#### Create a new migration

Migrations are created by running the create command:

```bash
yarn migrate create name-of-the-migration
```

This will result in the creation of a migration file inside of the `src/migrations/` directory. This migration file MUST contain the migration set up and rollback procedures.

#### Manually applying migrations

If required, these migrations can be run manually.

To run them manually:

```bash
yarn migrate up
```

To rollback them manually:

```bash
yarn migrate down
```

## Getting Started

### Prerequisites

Before running this service, ensure you have the following installed:

- **Node.js**: Version 20.x.x or higher
- **Yarn**: Version 1.22.x or higher
- **Docker**: For containerized deployment and local development dependencies
- **Docker Compose**: For orchestrating multiple services

#### Extra prerequisites (optional when not using Docker Compose)

- PostgreSQL 14+
- Redis 6+
- NATS 2+
- LocalStack (for AWS services emulation)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/decentraland/social-service-ea.git
cd social-service-ea
```

2. Install dependencies:

```bash
yarn install
```

3. Build the project:

```bash
yarn build
```

### Configuration

The service uses environment variables for configuration. Copy the example file and adjust as needed:

```bash
cp .env.default .env
```

See `.env.default` for available configuration options.

### Running the Service

#### Setting up the environment

In order to successfully run this server, external dependencies such as databases, caches, message brokers, and storage must be provided.

To do so, this repository provides you with a `docker-compose.yml` file for that purpose. In order to get the environment set up, run:

```bash
docker compose up -d --wait
```

This will start:
- PostgreSQL database on port `5432`
- Redis on port `6379`
- NATS message broker on port `4222`
- LocalStack (SNS and S3) on port `4566`

You can see the logs of the services with:

```bash
docker compose logs -f
```

#### Running in development mode

To run the service in development mode:

```bash
yarn dev
```

This will:
- Watch for file changes
- Automatically rebuild TypeScript
- Restart the server on changes

For production mode:

```bash
yarn start
```

## Testing

This service includes comprehensive test coverage with both unit and integration tests.

### Running Tests

Run all tests with coverage:

```bash
yarn test
```

Run only unit tests:

```bash
yarn test:unit
```

Run only integration tests:

```bash
yarn test:integration
```

Run tests in watch mode:

```bash
yarn test:unit:watch
yarn test:integration:watch
```

### Test Structure

- **Unit Tests** (`test/unit/`): Test individual components and functions in isolation
- **Integration Tests** (`test/integration/`): Test the complete request/response cycle

For detailed testing guidelines and standards, refer to our [Testing Standards](https://github.com/decentraland/docs/tree/main/development-standards/testing-standards) documentation.

## AI Agent Context

For detailed AI Agent context, see [docs/ai-agent-context.md](docs/ai-agent-context.md).

---

**Note**: This service requires multiple external dependencies. Using Docker Compose is the recommended way to run all dependencies locally for development.
