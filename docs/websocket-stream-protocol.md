# WebSocket stream protocol (`/v1/stream`)

The real-time updates of the social service (friendship changes, friends going online, blocks, private and community
voice chats) over a plain WebSocket with JSON text frames. It replaces the six `subscribeTo*` streams of the
`@dcl/rpc` `SocialService`, which keeps working on `/` of the same port until clients move. Everything that is not
real time is plain HTTP, documented in [openapi.yaml](openapi.yaml).

`ws://<host>:<RPC_SERVER_PORT>/v1/stream`

The events are this service's own JSON, not the protobuf messages of `social_service_v2.proto`. A user connected on
both protocols receives every update on both, and is only considered gone (their private voice chat is ended) when
the last connection of either kind closes.

## Handshake

The first client frame is the Signed Fetch auth chain as a JSON object of `x-identity-*` headers, signed for method
`get` and path `/` (the same frame the RPC socket expects). The server answers `{ "type": "ready" }`.

Close codes: `3003` unauthorized, `3004` no auth chain in time, `1013` connection pool full, `1008` the client is not
reading fast enough (updates cannot be replayed, so reconnect and resync).

## Messages

Client to server:

```json
{ "type": "subscribe", "id": "my-sub-1", "stream": "friendship_updates" }
{ "type": "unsubscribe", "id": "my-sub-1" }
{ "type": "ping" }
```

`id` is chosen by the client (1 to 64 characters, unique on the connection). A connection can hold one subscription
per stream.

Server to client:

```json
{ "type": "subscribed", "id": "my-sub-1" }
{ "type": "event", "id": "my-sub-1", "stream": "friendship_updates", "data": { "action": "accept", "address": "0x…" } }
{ "type": "end", "id": "my-sub-1", "reason": "unsubscribed" }
{ "type": "error", "id": "my-sub-1", "code": "unknown_stream", "message": "Unknown stream" }
{ "type": "pong" }
```

Error codes: `invalid_message`, `unknown_stream`, `duplicate_subscription`, `unknown_subscription`, `stream_error`,
`auth_in_progress`. A protocol error never closes the socket.

## Streams

A profile (`FriendProfile`) is `{ address, name, hasClaimedName, profilePictureUrl, nameColor? }`, the same shape the
friends HTTP endpoints return.

| `stream` | `data` | Replaces |
| --- | --- | --- |
| `friendship_updates` | `{ action: "request", id, address, createdAt, message?, friend: FriendProfile }` for a new request; `{ action: "accept" \| "reject" \| "cancel" \| "delete" \| "block", address }` otherwise. `address` is the other user. | `subscribeToFriendshipUpdates` |
| `friend_connectivity_updates` | `{ friend: FriendProfile, status: "online" \| "offline" \| "away" }`. Starts with one `online` event per friend already online. | `subscribeToFriendConnectivityUpdates` |
| `block_updates` | `{ address, isBlocked }`: `address` blocked (or unblocked) the user. | `subscribeToBlockUpdates` |
| `private_voice_chat_updates` | `{ callId, status: "requested" \| "accepted" \| "rejected" \| "ended" \| "expired", callerAddress?, connectionUrl? }`. `callerAddress` comes with `requested`; `connectionUrl` comes to the caller with `accepted`. | `subscribeToPrivateVoiceChatUpdates` |
| `community_member_connectivity_updates` | `{ communityId, memberAddress, status: "online" \| "offline" \| "away" }` | `subscribeToCommunityMemberConnectivityUpdates` |
| `community_voice_chat_updates` | `{ communityId, status: "started" \| "ended", createdAt, endedAt?, positions, worlds, isMember, communityName, communityImage? }` | `subscribeToCommunityVoiceChatUpdates` |

Each stream reads the same per-user updates as its RPC counterpart, with the same filters. Timestamps are milliseconds
since the epoch.

## Deprecating the RPC protocol

Both protocols are observable side by side: `rpc_procedure_call_total` and `rpc_updates_sent_on_subscription` count
RPC traffic, the `stream_ws_*` metrics count this protocol. When RPC traffic is negligible, `@dcl/rpc`,
`src/adapters/rpc-server`, `src/controllers/handlers/rpc`, `src/controllers/handlers/uws/ws-handler.ts` and
`src/utils/UWebSocketTransport.ts` can be removed.
