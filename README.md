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
- PostgreSQL 14+
- Redis 6+
- NATS 2+
- LocalStack (for AWS services emulation)

### Development Setup

```bash
# Clone and install
git clone https://github.com/decentraland/social-service-ea.git
cd social-service-ea
yarn install

# Start services
docker-compose up -d

# Run migrations
yarn migrate up

# Start the service
yarn dev
```

For detailed setup instructions, see [Getting Started](https://github.com/decentraland/social-service-ea/wiki/Getting-Started).

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
