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

### Presence

Who is online comes from Pulse, the only presence source: one NATS subject consumed,
`engine.parcel_changes`, plus reconciliation against `GET ${PULSE_URL}/peers?all=true`. `PULSE_URL`
is required at boot. See [docs/presence.md](docs/presence.md).

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
