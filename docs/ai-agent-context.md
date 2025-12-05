# AI Agent Context

**Service Purpose:** A microservice that handles social interactions for Decentraland, built using the Well Known Components architecture pattern. Enables users to create and manage communities, connect with friends, participate in voice chats, and engage in social activities within the metaverse.

**Key Capabilities:**

- **Community Management**: Create and manage communities with customizable privacy settings (public/private) and visibility (listed/unlisted)
- **Member Management**: Role-based permissions (owner, moderator, member) with invitation and join request workflows
- **Community Posts**: Share updates and announcements within communities with post likes
- **Place Associations**: Link communities with specific Decentraland locations
- **Voice Chat**: Real-time voice chat sessions within communities with role-based participation
- **Friendship Management**: Manage friend relationships and social connections (via RPC/gRPC)
- **Privacy Controls**: Blocking and privacy settings for user interactions
- **Referral System**: Track user referrals, invitations, and referral progress
- **User Profiles**: Integration with user profiles including claimed names and avatars
- **Online Status**: Track online status for community members

**Communication Pattern:** 
- Synchronous HTTP REST API (community management, posts, voice chats)
- RPC/gRPC (friendships, blocking, private messages)
- Event-driven via NATS messaging (real-time updates)
- Server-Sent Events (SSE) for real-time notification streams

**Technology Stack:**

- Runtime: Node.js 20.x
- Language: TypeScript
- HTTP Framework: @well-known-components/http-server
- RPC Framework: @dcl/rpc for gRPC communication
- Database: PostgreSQL (via @well-known-components/pg-component)
- Cache: Redis for performance optimization
- Message Broker: NATS for real-time updates
- Storage: AWS S3 for media storage
- Component Architecture: @well-known-components (logger, metrics, http-server, pg-component, nats-component, env-config-provider)

**External Dependencies:**

- **PostgreSQL**: Communities, members, posts, friendships, social settings, referrals, voice chats
- **Redis**: Caching layer for performance optimization
- **NATS**: Message broker for real-time updates and event distribution
- **AWS S3**: Media storage for community images and referral rewards
- **AWS SNS**: Event notifications for social events
- **Catalyst**: Content server for user profiles and avatar data
- **Places API**: Scene and place information
- **Comms Gatekeeper**: Voice chat token generation
- **Archipelago Stats**: User presence and online status

**Key Concepts:**

- **Community Privacy**: 
  - Public: Anyone can view and join
  - Private: Requires invitation or approval to join
- **Community Visibility**: 
  - Listed: Appears in public community listings
  - Unlisted: Only accessible via direct link, not shown in listings
- **Community Roles**: 
  - `owner`: Full control over the community
  - `moderator`: Can manage members, posts, and settings
  - `member`: Regular community member
  - `none`: Not a member of the community
- **Request Types**: 
  - `invite`: An invitation sent to a user to join a community
  - `request_to_join`: A request from a user to join a private community
- **Private Voice Chats**: One-on-one voice chat sessions between users with expiration times
- **Referral System**: Tracks user referrals with status, tier grants, and email associations

**Database Schema:**

- **Main Tables**: `communities`, `community_members`, `community_posts`, `community_post_likes`, `community_bans`, `community_requests`, `community_places`, `friendships`, `friendships_history`, `social_settings`, `blocks`, `private_voice_chats`, `referral_progress`, `referral_progress_viewed`, `referral_emails`, `referral_reward_images`, `community_ranking_metrics`
- **Key Relationships**: Communities have members, posts, bans, and places. Members have roles. Posts have likes. Referrals track progress and rewards.
- **Full Documentation**: See [docs/database-schemas.md](docs/database-schemas.md) for detailed schema, column definitions, and relationships

**API Specification:** OpenAPI docs available at [docs/openapi.yaml](docs/openapi.yaml)

**Authentication Notes:**

- Most REST endpoints use Signed Fetch authentication (ADR-44)
- Admin endpoints use Bearer token authentication
- RPC/gRPC endpoints use different authentication mechanisms
- Scene-based requests are prevented for additional security

