# Presence sources

Who is online is the input to friend connectivity updates (`FRIEND_STATUS_UPDATES_CHANNEL`),
community member connectivity updates and the online filter of `getCommunityMembers`. This document
describes where that information comes from, how the migration from archipelago to Pulse is staged,
and which environment variables drive it.

## The two sources

| | archipelago (today) | pulse (target) |
|---|---|---|
| event feed | five NATS subjects: `peer.*.connect`, `peer.*.disconnect`, `peer.*.heartbeat`, `peer.*.world.join`, `peer.*.world.leave` | one NATS subject: `engine.parcel_changes` (`decentraland.pulse.ParcelChangesBatch`) |
| reconciliation | `GET ${ARCHIPELAGO_STATS_URL}/peers` every 5 s → `connected-peers` | `GET ${PULSE_URL}/peers?all=true` every 5 s → `connected-peers-pulse` |
| world peers | tracked separately in the `world-connected-peers` redis set, unioned into `getConnectedPeers()` | no separate set: `/peers?all=true` already covers every realm, worlds included |
| adapter | `src/adapters/archipelago-stats.ts` | `src/adapters/pulse-stats.ts` |

The Pulse feed carries realm and parcel for every peer of every realm, so the world-specific
bookkeeping the archipelago source needed disappears with it.

### The `engine.parcel_changes` contract (C1)

```protobuf
message Parcel { int32 x = 1; int32 y = 2; }
message ParcelChange { string address = 1; string realm = 2; optional Parcel parcel = 3; }
message ParcelChangesBatch { string server_name = 1; uint64 seq = 2; bool snapshot = 3; uint64 server_time = 4; repeated ParcelChange changes = 5; }
```

What this service does with a batch (C5):

- one status event per `ParcelChange`: `parcel` **present** → `ONLINE`, `parcel` **absent** → `OFFLINE`.
  `parcel: {}` on the wire is the parcel `(0, 0)` — present, therefore `ONLINE`.
- `seq` and `snapshot` need no special handling. Snapshot batches go through the same code path;
  they are idempotent because a status is only published when it differs from the cached one. A peer
  that is *missing* from a snapshot is **not** flipped `OFFLINE` — the 5 s `/peers?all=true` poll is
  what reconciles the full set.
- `address` and `realm` are lowercase by contract. A non-lowercase value is logged as a contract
  violation (`Contract violation: parcel change with a non-canonical realm`) and the change is still
  applied against the lowercased address — never a reason to drop state.
- a batch that cannot be decoded is logged and dropped; the subscription stays alive.

### MGET batching

The old handlers processed one peer per NATS message, so one `GET peer-status:<address>` per message
was fine. A `ParcelChangesBatch` carries up to the full population of a Pulse instance, so the
cached statuses of a whole batch are read with a **single** `MGET` (`redis.client.mGet`, which keeps
positional alignment with the requested keys — `redis.mGet` drops nulls and cannot be used here)
before anything is published. Only the addresses whose status actually changed are then written and
published. Writes stay one `SET` per flipped peer because each carries its own TTL
(`STATUS_CACHE_TTL_IN_SECONDS`).

## `PRESENCE_SOURCE`

`PRESENCE_SOURCE` selects the source. It defaults to `archipelago`, so a deploy with no
configuration change behaves exactly like before this work package. An unrecognised value falls back
to the default.

| mode | NATS subscriptions | synchronizer writes | `getConnectedPeers()` serves |
|---|---|---|---|
| `archipelago` (default) | the five `peer.*` subjects | `connected-peers` | `connected-peers` ∪ `world-connected-peers` |
| `pulse` | `engine.parcel_changes` only | `connected-peers-pulse` | `connected-peers-pulse` |
| `both` | the five `peer.*` subjects **and** `engine.parcel_changes` | `connected-peers` **and** `connected-peers-pulse` | `connected-peers` ∪ `world-connected-peers` |

`both` is the dual-source window: both feeds run and both caches are filled, but reads still come
from the old set, so the new source can be observed under production traffic without serving it.

### The 60 s diff logger

While `PRESENCE_SOURCE=both`, `peer-tracking` logs one `Presence source diff` line every 60 s
(`PRESENCE_DIFF_INTERVAL_MS`) with **counts only — never addresses**:

| field | meaning |
|---|---|
| `archipelagoPeers` / `pulsePeers` | size of each cached peer set |
| `onlyInArchipelago` / `onlyInPulse` | one half of the symmetric difference each |
| `symmetricDifference` | their sum |
| `archipelagoFlips` / `pulseFlips` | status flips published by each feed since the previous line |

The flip counters are per window: they reset every time a line is logged. A healthy window has a
small, stable symmetric difference (peers in flight between the two 5 s polls) and comparable flip
counts.

## Staged deletion of the world-peer bookkeeping

`src/adapters/worlds-stats.ts`, `WORLD_PEERS_CACHE_KEY`, `IWorldsStatsComponent` and the
`peer.*.world.join` / `peer.*.world.leave` handlers are `@deprecated` but still in the tree. They are
only *exercised* in `archipelago` and `both`: in `pulse` mode nothing subscribes to the world
subjects and `getConnectedPeers()` never reads the world set. The files are deleted in rollout
step 8, once `PRESENCE_SOURCE=pulse` is permanent and the flag itself goes away.

The `worldsStats` component is still constructed unconditionally in `src/components.ts`: it is a thin
redis wrapper that opens nothing at construction time, and making it optional would turn a
staged-deletion step into a repo-wide optional-component refactor.

## Environment variables

| key | default | notes |
|---|---|---|
| `PRESENCE_SOURCE` | `archipelago` | `archipelago` \| `pulse` \| `both`. Unknown values fall back to `archipelago`. |
| `PULSE_URL` | — | Pulse base URL. Required when `PRESENCE_SOURCE` is `pulse` or `both`. |
| `ARCHIPELAGO_STATS_URL` | — | Stays until `PRESENCE_SOURCE` is removed. Required when `PRESENCE_SOURCE` is `archipelago` or `both`. |
| `PEER_SYNC_INTERVAL_MS` | `5000` | Reconciliation poll interval, both sources. |
| `PEERS_SYNC_CACHE_TTL_MS` | `10000` | TTL of the reconciled peer sets. |
| `STATUS_CACHE_TTL_IN_SECONDS` | `3600` | TTL of `peer-status:<address>`, the per-peer dedupe cache. |

## Rollout

1. Deploy with `PRESENCE_SOURCE` unset (`archipelago`) — no behaviour change.
2. Set `PULSE_URL`, switch to `both`, watch `Presence source diff`.
3. Switch to `pulse` once the symmetric difference is stable and small.
4. Rollback at any point is a single environment variable.
5. (Step 8 of the programme rollout) delete `worlds-stats`, `archipelago-stats`,
   `ARCHIPELAGO_STATS_URL` and the flag.
