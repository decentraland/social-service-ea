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
`get` and path `/` (the same frame the RPC socket expects). The server answers `{ "type": "ready" }`. Clients must
wait for `ready` before sending anything else: a frame sent while the auth chain is being verified is answered with
`auth_in_progress` and discarded.

Close codes:

| Code | Reason |
| --- | --- |
| `3003` | The auth chain was rejected. |
| `3004` | No auth chain arrived within `WS_AUTH_TIMEOUT_IN_MS` (shared with the RPC socket). |
| `1013` | The instance connection pool is full, or the address already holds `WS_MAX_CONNECTIONS_PER_ADDRESS` sockets. Retry with backoff. |
| `1008` | A policy limit: the client is not reading fast enough, a subscription queue overflowed, or the message rate was exceeded. Updates cannot be replayed, so reconnect and resync. |
| `1001` | The server is shutting down. |

## Messages

Client to server:

```json
{ "type": "subscribe", "id": "my-sub-1", "stream": "friendship_updates" }
{ "type": "unsubscribe", "id": "my-sub-1" }
{ "type": "ping" }
```

`id` is chosen by the client (1 to 64 characters, unique on the connection) for both `subscribe` and `unsubscribe`;
an invalid `id` is never echoed back. A connection can hold one subscription per stream. `unsubscribe` is
acknowledged right away with `end` (`reason: "unsubscribed"`): no event for that `id` follows it, even when its
initial snapshot was still loading, and the `id` and stream can be subscribed again immediately.

Server to client:

```json
{ "type": "subscribed", "id": "my-sub-1" }
{ "type": "event", "id": "my-sub-1", "stream": "friendship_updates", "data": { "action": "accept", "address": "0x…" } }
{ "type": "end", "id": "my-sub-1", "reason": "unsubscribed" }
{ "type": "error", "id": "my-sub-1", "code": "unknown_stream", "message": "Unknown stream" }
{ "type": "pong" }
```

Error codes: `invalid_message`, `unknown_stream`, `duplicate_subscription`, `unknown_subscription`, `stream_error`,
`rate_limited`, `auth_in_progress`. Individual protocol errors keep the socket open; exceeding the message-rate limit
closes it. `rate_limited` ends that one subscription because the address started subscriptions faster than its
shared budget allows; retry it with backoff.

## Streams

Events carry addresses only, never profiles: clients resolve the profiles themselves, as with the v2 HTTP endpoints.
Unlike the RPC streams, an event is not dropped when the other user has no resolvable profile.

| `stream` | `data` | Replaces |
| --- | --- | --- |
| `friendship_updates` | `{ action: "request", id, address, createdAt, message? }` for a new request; `{ action: "accept" \| "reject" \| "cancel" \| "delete" \| "block", address }` otherwise. `address` is the other user. | `subscribeToFriendshipUpdates` |
| `friend_connectivity_updates` | `{ address, status: "online" \| "offline" \| "away" }`: `address` is the friend. Starts with one `online` event per friend already online. | `subscribeToFriendConnectivityUpdates` |
| `block_updates` | `{ address, isBlocked }`: `address` blocked (or unblocked) the user. | `subscribeToBlockUpdates` |
| `private_voice_chat_updates` | `{ callId, status: "requested" \| "accepted" \| "rejected" \| "ended" \| "expired", callerAddress?, connectionUrl? }`. `callerAddress` comes with `requested`; `connectionUrl` comes to the caller with `accepted`. | `subscribeToPrivateVoiceChatUpdates` |
| `community_member_connectivity_updates` | `{ communityId, memberAddress, status: "online" \| "offline" \| "away" }` | `subscribeToCommunityMemberConnectivityUpdates` |
| `community_voice_chat_updates` | `{ communityId, status: "started" \| "ended", createdAt, endedAt?, positions, worlds, isMember, communityName, communityImage? }` | `subscribeToCommunityVoiceChatUpdates` |

Each stream reads the same per-user updates as its RPC counterpart, with the same filters. Timestamps are milliseconds
since the epoch.

## Deprecating the RPC protocol

Both protocols are observable side by side: `rpc_procedure_call_total` and `rpc_updates_sent_on_subscription` count
RPC traffic, the `stream_ws_*` metrics count this protocol. `ws_active_connections_by_protocol`,
`ws_connection_duration_seconds_by_protocol`, `ws_auth_errors_by_protocol` and `ws_admission_rejections` split the
shared socket metrics by `protocol` (`rpc` or `stream`). When RPC traffic is negligible, `@dcl/rpc`,
`src/adapters/rpc-server`, `src/controllers/handlers/rpc`, `src/controllers/handlers/uws/ws-handler.ts` and
`src/utils/UWebSocketTransport.ts` can be removed.

## Backpressure and message limits

Outgoing socket buffering uses `WS_MAX_BACKPRESSURE` (default 128 KiB). When a write is buffered, the connection's
subscriptions stop sending until uWS reports the socket drained, so a large initial snapshot does not overrun the
buffer. A dropped socket write closes the connection with 1008 (`Slow consumer`). Each subscription also has a 1,000-event queue; overflow closes the
connection with 1008 (`Subscription overflow; reconnect and resync`) instead of silently continuing after event loss.
There is no replay: reconnect with backoff, subscribe again, and resync state through HTTP.

Incoming application frames, including authentication, malformed messages and JSON pings, share a per-connection
token bucket. `STREAM_WS_MESSAGES_PER_SECOND` defaults to 20, and `STREAM_WS_MESSAGE_BURST` defaults to 40.
Exceeding it closes the connection with 1008 (`Message rate exceeded; reconnect with backoff`). Native WebSocket
ping/pong frames are unaffected. Incoming frames are capped by `STREAM_WS_MAX_PAYLOAD_LENGTH` (default 16 KiB, enough
for a Signed Fetch auth chain); uWS drops the connection on a larger frame. The RPC socket keeps
`WS_MAX_PAYLOAD_LENGTH`.

Some limits are per address and shared by RPC and JSON sockets, so opening more sockets does not multiply them. An
address can hold `WS_MAX_CONNECTIONS_PER_ADDRESS` sockets (default 8) across both protocols. Subscription starts on
either protocol draw from one token bucket per address: `WS_SUBSCRIPTIONS_PER_SECOND` (default 2) and
`WS_SUBSCRIPTION_BURST` (default 24). The bucket survives reconnects, so reconnecting does not refill it. At most
`WS_ADDRESS_BUDGET_CAPACITY` addresses (default 10,000) are tracked per instance; idle, fully refilled entries are
reclaimed first, and new addresses get 1013 only when none can be.

## RPC parity checks

`test/unit/controllers/handlers/uws/stream-parity.spec.ts` compares the generated RPC server-streaming methods,
registered RPC routes and JSON registry. Every stream must also have shared event fixtures in
`test/fixtures/stream-parity.ts`. Those fixtures run through both production subscription implementations;
a test-only normalizer compares their meaning without importing production JSON mappers. Reviewed snapshots
also pin the complete payloads, including fields intentionally omitted by normalization.

The contract suite covers event variants, recipient filters, initial online-friend snapshots and the intentional
profile lookup difference: JSON delivers addresses even when RPC skips an event after profile lookup fails.
`test/integration/stream-parity-controller.spec.ts` checks real protobuf/JSON wire delivery for the same fixtures,
targeted pubsub routing (friendships, blocks and private-call credentials), and unsubscribe/disconnect isolation
for all six streams. It does not replace the shared fan-out authorization tests for community visibility and friendship membership.
Both files run in the existing unit/integration CI jobs. When changing either protocol, add fixtures for new variants
and review snapshot changes; do not refresh snapshots to bypass an unexplained contract mismatch.

## Implementation boundaries

The `/v1/stream` controller only registers the uWS route and delegates callbacks to `streamSessions`.
`createStreamSessionsComponent` is wired in `src/components.ts`, implements `IStreamSessionsComponent`, and owns
message validation, authentication state, rate budgets, subscriptions and shutdown cleanup. On shutdown, `wsPool`
normally ends every socket first, and each uWS close callback releases its connection. The component's own stop hook
is a fallback for sockets still open after that: it cancels authentication timers, releases subscriptions and ends
the socket. Both paths are idempotent, so a connection is released once whichever runs first.

RPC and JSON reuse the subscription policies and online-friend lookup in `logic/subscriptions/policies.ts`,
wallet verification and timeout settings in `utils/ws-session.ts`, and last-connection cleanup in
`logic/subscriptions/lifecycle.ts`. Shared event names and context types live in `types/subscriptions.ts`.
Each transport retains its own serialization and profile-enrichment behavior.
