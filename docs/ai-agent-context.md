# AI Agent Context

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

**Database Schema:**

- **Tables**: `friendships` (relationships), `friendship_actions` (history), `blocks` (blocking), `social_settings` (privacy), `communities` (groups), `community_members` (membership), `community_bans` (bans), `community_places` (places), `community_posts` (posts), `community_post_likes` (likes), `community_requests` (requests), `private_voice_chats` (voice chats), `referral_progress` (referrals), `referral_progress_viewed` (referral views)
- **Key Columns**: `friendships.address_requester`, `friendships.address_requested`, `friendships.is_active`, `communities.id` (PK), `community_members.community_id` (FK), `blocks.blocker_address`
- **Full Documentation**: See [docs/database-schema.md](docs/database-schema.md) for detailed schema, column definitions, and relationships
