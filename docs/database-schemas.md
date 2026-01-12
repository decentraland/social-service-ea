# Database Schema Documentation

This document describes the database schema for the Social Service EA. The schema uses PostgreSQL and is managed through migrations located in `src/migrations/`.

## Database Schema Diagram

```mermaid
erDiagram
    communities {
        UUID id PK "Community ID"
        VARCHAR name "Community name"
        TEXT description "Community description"
        VARCHAR owner_address "Owner address"
        BOOLEAN private "Privacy flag"
        BOOLEAN active "Active status"
        BOOLEAN unlisted "Visibility flag"
        TIMESTAMP created_at "Creation timestamp"
        TIMESTAMP updated_at "Update timestamp"
    }
    
    community_members {
        UUID id PK "Member record ID"
        UUID community_id FK "Community reference"
        VARCHAR member_address "Member address"
        VARCHAR role "Member role"
        TIMESTAMP joined_at "Join timestamp"
    }
    
    community_posts {
        UUID id PK "Post ID"
        UUID community_id FK "Community reference"
        VARCHAR author_address "Author address"
        TEXT content "Post content"
        TIMESTAMP created_at "Creation timestamp"
    }
    
    community_post_likes {
        UUID post_id PK FK "Post reference"
        VARCHAR user_address PK "User address"
        TIMESTAMP liked_at "Like timestamp"
    }
    
    friendships {
        UUID id PK "Friendship ID"
        VARCHAR address_requester "Requester address"
        VARCHAR address_requested "Requested address"
        BOOLEAN is_active "Active status"
        TIMESTAMP created_at "Creation timestamp"
        TIMESTAMP updated_at "Update timestamp"
    }
    
    social_settings {
        VARCHAR address PK "User address"
        VARCHAR private_messages_privacy "Privacy setting"
        VARCHAR blocked_users_messages_visibility "Visibility setting"
    }
    
    private_voice_chats {
        UUID id PK "Voice chat ID"
        VARCHAR caller_address "Caller address"
        VARCHAR callee_address "Callee address"
        TIMESTAMP created_at "Creation timestamp"
        TIMESTAMP updated_at "Update timestamp"
        TIMESTAMP expires_at "Expiration timestamp"
    }
    
    referral_progress {
        UUID id PK "Referral ID"
        TEXT referrer "Referrer address"
        TEXT invited_user "Invited user address"
        TEXT status "Referral status"
        BIGINT signed_up_at "Sign up timestamp"
        BOOLEAN tier_granted "Tier granted flag"
        BIGINT tier_granted_at "Tier granted timestamp"
        BIGINT created_at "Creation timestamp"
        BIGINT updated_at "Update timestamp"
    }
    
    communities ||--o{ community_members : "has"
    communities ||--o{ community_posts : "has"
    communities ||--o{ community_bans : "has"
    communities ||--o{ community_places : "has"
    communities ||--o{ community_requests : "has"
    community_posts ||--o{ community_post_likes : "has"
```

## Tables Overview

The database contains the following main tables:

1. **`communities`** - Stores community information and settings
2. **`community_members`** - Tracks community membership with roles
3. **`community_posts`** - Community posts and announcements
4. **`community_post_likes`** - Post likes by users
5. **`community_bans`** - Banned users from communities
6. **`community_requests`** - Join requests and invitations
7. **`community_places`** - Place associations for communities
8. **`friendships`** - Friend relationships between users
9. **`friendships_history`** - Historical friendship records
10. **`social_settings`** - User privacy and social settings
11. **`blocks`** - Blocked user relationships
12. **`private_voice_chats`** - One-on-one voice chat sessions
13. **`referral_progress`** - User referral tracking
14. **`referral_progress_viewed`** - Referral progress view tracking
15. **`referral_emails`** - Email associations for referrals
16. **`referral_reward_images`** - Referral reward images
17. **`community_ranking_metrics`** - Community ranking and metrics

## Table: `communities`

Stores community information including name, description, owner, privacy settings, and visibility.

### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NOT NULL | **Primary Key**. Unique community identifier. |
| `name` | VARCHAR | NOT NULL | Community name. |
| `description` | TEXT | NOT NULL | Community description. |
| `owner_address` | VARCHAR | NOT NULL | Ethereum address of the community owner. |
| `private` | BOOLEAN | NOT NULL | Privacy flag. `true` for private communities, `false` for public. Defaults to `false`. |
| `active` | BOOLEAN | NOT NULL | Active status. Defaults to `true`. |
| `unlisted` | BOOLEAN | NOT NULL | Visibility flag. `true` for unlisted communities. |
| `created_at` | TIMESTAMP | NOT NULL | Timestamp when the community was created. Defaults to `now()`. |
| `updated_at` | TIMESTAMP | NOT NULL | Timestamp when the community was last updated. Defaults to `now()`. |

### Indexes

- **Primary Key**: `id`

### Business Rules

1. Each community has one owner
2. Private communities require invitation or approval to join
3. Unlisted communities don't appear in public listings

---

## Table: `community_members`

Tracks community membership with role-based permissions.

### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NOT NULL | **Primary Key**. Unique member record identifier. |
| `community_id` | UUID | NOT NULL | **Foreign Key** to `communities.id`. |
| `member_address` | VARCHAR | NOT NULL | Ethereum address of the member. |
| `role` | VARCHAR | NOT NULL | Member role: `owner`, `moderator`, or `member`. |
| `joined_at` | TIMESTAMP | NOT NULL | Timestamp when the member joined. Defaults to `now()`. |

### Indexes

- **Primary Key**: `id`
- **Foreign Key**: `community_id` references `communities(id)` ON DELETE CASCADE

### Business Rules

1. Each community can have multiple members
2. Roles: `owner`, `moderator`, `member`
3. Owner has full control, moderators can manage members and posts

---

## Table: `community_posts`

Stores posts and announcements within communities.

### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NOT NULL | **Primary Key**. Unique post identifier. Auto-generated. |
| `community_id` | UUID | NOT NULL | **Foreign Key** to `communities.id`. |
| `author_address` | VARCHAR | NOT NULL | Ethereum address of the post author. |
| `content` | TEXT | NOT NULL | Post content. |
| `created_at` | TIMESTAMP | NOT NULL | Timestamp when the post was created. Defaults to `now()`. |

### Indexes

- **Primary Key**: `id`
- **Foreign Key**: `community_id` references `communities(id)` ON DELETE CASCADE
- **Index**: `community_id` - For efficient community post queries
- **Index**: `community_posts_community_created_idx` on `(community_id, created_at)` - For sorted post queries

### Business Rules

1. Posts belong to a single community
2. Posts are ordered by creation time (newest first)
3. Only community members can create posts

---

## Table: `community_post_likes`

Tracks likes on community posts.

### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `post_id` | UUID | NOT NULL | **Primary Key (part 1)**. **Foreign Key** to `community_posts.id`. |
| `user_address` | VARCHAR | NOT NULL | **Primary Key (part 2)**. Ethereum address of the user who liked the post. |
| `liked_at` | TIMESTAMP | NOT NULL | Timestamp when the post was liked. Defaults to `now()`. |

### Indexes

- **Composite Primary Key**: `(post_id, user_address)` - One like per user per post
- **Foreign Key**: `post_id` references `community_posts(id)` ON DELETE CASCADE
- **Index**: `post_id` - For efficient like counting

### Business Rules

1. One like per user per post
2. Likes are deleted when posts are deleted (CASCADE)

---

## Table: `friendships`

Stores friend relationships between users.

### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NOT NULL | **Primary Key**. Unique friendship identifier. |
| `address_requester` | VARCHAR | NOT NULL | Ethereum address of the user who sent the friend request. |
| `address_requested` | VARCHAR | NOT NULL | Ethereum address of the user who received the friend request. |
| `is_active` | BOOLEAN | NOT NULL | Active status. `true` when friendship is active. Defaults to `false`. |
| `created_at` | TIMESTAMP | NOT NULL | Timestamp when the friendship was created. Defaults to `now()`. |
| `updated_at` | TIMESTAMP | NOT NULL | Timestamp when the friendship was last updated. Defaults to `now()`. |

### Indexes

- **Primary Key**: `id`

### Business Rules

1. Friendships are bidirectional when `is_active = true`
2. Friend requests start with `is_active = false`
3. Historical records are maintained in `friendships_history`

---

## Table: `social_settings`

Stores user privacy and social interaction settings.

### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `address` | VARCHAR(42) | NOT NULL | **Primary Key**. Ethereum address of the user. |
| `private_messages_privacy` | VARCHAR | NOT NULL | Privacy setting for private messages. Defaults to `ONLY_FRIENDS`. |
| `blocked_users_messages_visibility` | VARCHAR | NOT NULL | Visibility setting for blocked users' messages. Defaults to `SHOW_MESSAGES`. |

### Indexes

- **Primary Key**: `address`

### Constraints

- **Check Constraint**: `valid_private_messages_privacy` - Ensures valid privacy values
- **Check Constraint**: `valid_blocked_users_messages_visibility` - Ensures valid visibility values

### Business Rules

1. One settings record per user
2. Privacy settings control who can send private messages
3. Visibility settings control how blocked users' messages are displayed

---

## Table: `private_voice_chats`

Tracks one-on-one voice chat sessions between users.

### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NOT NULL | **Primary Key**. Unique voice chat identifier. |
| `caller_address` | VARCHAR | NOT NULL | Ethereum address of the caller. |
| `callee_address` | VARCHAR | NOT NULL | Ethereum address of the callee. |
| `created_at` | TIMESTAMP | NOT NULL | Timestamp when the voice chat was created. Defaults to `now()`. |
| `updated_at` | TIMESTAMP | NOT NULL | Timestamp when the voice chat was last updated. Defaults to `now()`. |
| `expires_at` | TIMESTAMP | NOT NULL | Timestamp when the voice chat expires. Must be greater than current time. |

### Indexes

- **Primary Key**: `id`
- **Index**: `caller_address` - For efficient caller queries
- **Index**: `callee_address` - For efficient callee queries

### Constraints

- **Check Constraint**: `private_voice_chats_expires_at_check` - Ensures `expires_at > now()`

### Business Rules

1. Only one active private voice chat per user pair
2. Voice chats have expiration times
3. Expired voice chats are automatically cleaned up

---

## Table: `referral_progress`

Tracks user referrals and invitation progress.

### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | NOT NULL | **Primary Key**. Unique referral identifier. |
| `referrer` | TEXT | NOT NULL | Ethereum address of the referrer. |
| `invited_user` | TEXT | NOT NULL | Ethereum address of the invited user. |
| `status` | TEXT | NOT NULL | Referral status. |
| `signed_up_at` | BIGINT | NULL | Timestamp (in milliseconds) when the user signed up. |
| `tier_granted` | BOOLEAN | NOT NULL | Whether a tier reward was granted. Defaults to `false`. |
| `tier_granted_at` | BIGINT | NULL | Timestamp (in milliseconds) when the tier was granted. |
| `created_at` | BIGINT | NOT NULL | Timestamp (in milliseconds) when the referral was created. |
| `updated_at` | BIGINT | NOT NULL | Timestamp (in milliseconds) when the referral was last updated. |

### Indexes

- **Primary Key**: `id`
- **Unique Index**: `unique_referral_progress_referrer_invited_user` on `(referrer, invited_user)` - One referral per referrer-invited pair
- **Index**: `idx_referral_progress_invited_user` on `invited_user` - For efficient invited user queries

### Business Rules

1. One referral record per referrer-invited user pair
2. Status tracks the referral progress
3. Timestamps stored in milliseconds (BIGINT)

---

## Related Code

- **Migrations**: `src/migrations/`
- **Database Adapters**: `src/adapters/db/`
- **Types**: `src/types/`

