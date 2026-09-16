# Presence

Who is online is the input to friend connectivity updates (`FRIEND_STATUS_UPDATES_CHANNEL`),
community member connectivity updates and the online filter of `getCommunityMembers`. Pulse is the
only source of that information: there is no `PRESENCE_SOURCE`, no LiveKit fallback and no shadow
mode. This document describes the feed, what this service does with it, the reconciliation, the
required configuration, the deploy order and the rollback.

## The feed (C1)

One NATS subject, `engine.parcel_changes`, carrying `decentraland.pulse.ParcelChangesBatch`:

```protobuf
message Parcel { int32 x = 1; int32 y = 2; }
message ParcelChange { string address = 1; string realm = 2; optional Parcel parcel = 3; }
message ParcelChangesBatch { string server_name = 1; uint64 seq = 2; bool snapshot = 3; uint64 server_time = 4; repeated ParcelChange changes = 5; }
```

`address` and `realm` are lowercase by contract. Pulse publishes a snapshot batch on startup, every 60 seconds and after outbox eviction, and delta batches as players move, connect, disconnect or change realm/world — one entry
per affected wallet, at most once per batch (C1 §5).

## Consumer semantics (C5)

`src/adapters/peer-tracking.ts` holds exactly one NATS subscription (`PARCEL_CHANGES_SUBJECT`,
`engine.parcel_changes`) and derives one status event per `ParcelChange`:

- `parcel` **present** → `ONLINE`. `parcel: {}` on the wire decodes to `(0, 0)` — a placement, not
  an exit.
- `parcel` **absent** → `OFFLINE`.
- `seq` and `snapshot` need no special handling: snapshot batches go through the same code path as
  deltas. A peer that is *missing* from a snapshot is **not** flipped `OFFLINE` here — the 5 s
  `/peers?all=true` poll (below) is what reconciles the full set.
- a non-lowercase `realm` or `address` is a contract violation: logged
  (`Contract violation: parcel change with a non-canonical realm` /
  `...non-canonical address`) and the change is still applied against the lowercased address — a
  producer bug must not cost us presence state.
- a batch that cannot be decoded is logged and dropped; the subscription stays alive.

### Idempotent snapshots and MGET batching

A `ParcelChangesBatch` can carry the full population of a Pulse instance, so the cached statuses of
a whole batch are read with a **single** `MGET` (`redis.client.mGet`, which keeps positional
alignment with the requested keys — `redis.mGet` drops nulls and cannot be used here) before
anything is written or published. Only the addresses whose status actually changed against
`peer-status:<address>` are then written and published, which is what makes replaying the same
snapshot a no-op: every status already matches the cache, so nothing is re-published. Writes are
issued in chunks of `STATUS_PUBLISH_CHUNK_SIZE` (100) rather than one `Promise.all` over the whole
batch, since a publisher-start snapshot flips every peer of a server at once and each flip costs one
`SET` plus two `PUBLISH`. Each chunk waits for all wallet updates to settle; failures are logged
with a count, and processing continues through the remaining chunks.

### Known exposure: a dropped OFFLINE (unchanged, follow-up)

`peer-status:` is written only by the event path. If a batch is lost — an `MGET` rejection, a decode
error, a NATS gap — the peer stays cached `ONLINE` until `STATUS_CACHE_TTL_IN_SECONDS` (1 h) expires,
because Pulse never repeats an exit entry and the 5 s `/peers?all=true` poll refreshes the peer
*sets* but never the status cache. This is recorded rather than fixed here; reconciling the status
cache from the 5 s poll is a follow-up to take if metrics show stuck-`ONLINE` peers.

## Reconciliation

`src/adapters/pulse-stats.ts` calls `GET ${PULSE_URL}/peers?all=true` — the unfiltered, every-realm
view, worlds included — and lowercases every id. `src/adapters/peers-synchronizer.ts` fills
`PEERS_CACHE_KEY` (`connected-peers`) from it every `PEER_SYNC_INTERVAL_MS` (default 5 s).
`src/logic/peers-stats/peers-stats.ts` (`getConnectedPeers()`) reads that one cache key; a read
failure degrades to an empty set rather than failing its callers.

There is no separate world-peer set any more: `/peers?all=true` already covers every realm.

## Protocol dependency

Presence decoding uses the planned `3ef4c52` build under the `@dcl/pulse-protocol` package name.
The existing `@dcl/protocol` dependency stays at the version used by `main`: it includes social
subscription stream-closure fields missing from the Pulse build. Consolidate them after protocol
[#454](https://github.com/decentraland/protocol/pull/454) is released with both sets of messages.

## Required configuration

| key | default | notes |
|---|---|---|
| `PULSE_URL` | — | Pulse base URL. Required unconditionally at boot: it must parse as an absolute `http(s)` URL or component creation throws. Deliberately **commented out** in `.env.default`, because that file is a live config source inside the deployed image and a placeholder there would satisfy `requireString` and hide a missing value exactly where it matters. |
| `PEER_SYNC_INTERVAL_MS` | `5000` | Reconciliation poll interval. |
| `PEERS_SYNC_CACHE_TTL_MS` | `10000` | TTL of the reconciled peer set (`PEERS_CACHE_KEY`). |
| `STATUS_CACHE_TTL_IN_SECONDS` | `3600` | TTL of `peer-status:<address>`, the per-peer dedupe cache. |

## Deploy order

1. Inject a valid `PULSE_URL` before deploying; startup fails without it. Deploy this build **after** Pulse publishes `engine.parcel_changes` in the target environment —
   before that, this service would boot and never receive presence events.
2. Deploy this build **before** worlds-content-server's Pulse-only build: that build stops
   publishing `peer.*.world.*`, which the previous image (still running `archipelago-stats` +
   `peer.*` handlers) depends on for world presence.
3. Deploy this build **before or together with** archipelago-workers #128: today's image maps
   `peer.*.connect` to `OFFLINE`, and archipelago-workers #128 starts publishing that subject on
   every completed handshake. Running the old image against a #128 ws-connector would flip a
   just-connected peer OFFLINE.

## Rollback

Rollback is the previous image. It needs `archipelago-stats` and the client WS heartbeats alive —
if those have already been retired in the environment, the previous image has no presence feed
either and rollback does not restore working presence. Verification against the legacy answer
(previous deployment vs. this one) happens outside this service, in the WP10 harness.
