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
(`STATUS_CACHE_TTL_IN_SECONDS`), but they are issued in chunks of `STATUS_PUBLISH_CHUNK_SIZE` (100)
rather than one `Promise.all` over the whole batch: a publisher-start snapshot flips every peer of a
server at once and each flip costs one `SET` plus two `PUBLISH`.

## `PRESENCE_SOURCE`

`PRESENCE_SOURCE` selects the source. It defaults to `archipelago`, so a deploy with no
configuration change behaves exactly like before this work package. An unrecognised value falls back
to the default.

| mode | NATS subscriptions | synchronizer writes | status namespace / publishes | `getConnectedPeers()` serves |
|---|---|---|---|---|
| `archipelago` (default) | the five `peer.*` subjects | `connected-peers` | `peer-status:` → publishes | `connected-peers` ∪ `world-connected-peers` |
| `pulse` | `engine.parcel_changes` only | `connected-peers-pulse` | `peer-status:` → publishes | `connected-peers-pulse` |
| `both` | the five `peer.*` subjects **and** `engine.parcel_changes` | `connected-peers` **and** `connected-peers-pulse` | archipelago: `peer-status:` → publishes; pulse: `peer-status-pulse:` → **shadow, publishes nothing** | `connected-peers` ∪ `world-connected-peers` |

### `both` is a shadow window

In `both`, **only the archipelago handlers publish**. The `engine.parcel_changes` handler decodes
every batch, derives its status events and dedupes them exactly as in `pulse` mode, but against its
own key namespace (`peer-status-pulse:<address>`, same `STATUS_CACHE_TTL_IN_SECONDS`), and it never
writes to `FRIEND_STATUS_UPDATES_CHANNEL` or `COMMUNITY_MEMBER_CONNECTIVITY_UPDATES_CHANNEL`. So in
`both` neither the read path (`getConnectedPeers()` serves the old set) nor the push path is fed by
the source under evaluation: a peer that Pulse has evicted while archipelago still heartbeats it —
exactly the disagreement the window exists to measure — cannot produce a spurious offline blip for
a client.

The two namespaces are separate for a second reason: they are what makes the flip counters
meaningful. If both feeds deduped against `peer-status:`, whichever feed observed a transition first
would record the flip and the other would see `cached === status` and record none, so `pulseFlips`
would read ≈ 0 for a *perfectly healthy* Pulse — the same 0 it reads when the subscription is dead.
With one namespace per feed, `archipelagoFlips` and `pulseFlips` each measure their own feed's flip
volume and can be compared.

In `pulse` mode the Pulse feed is the only feed: it owns the live `peer-status:` namespace and it
publishes.

### The 60 s diff logger

While `PRESENCE_SOURCE=both`, `peer-tracking` logs one `Presence source diff` line every 60 s
(`PRESENCE_DIFF_INTERVAL_MS`) with **counts only — never addresses**:

| field | meaning |
|---|---|
| `archipelagoPeers` / `pulsePeers` | size of each cached peer set (`connected-peers` vs `connected-peers-pulse`) |
| `onlyInArchipelago` / `onlyInPulse` | one half of the symmetric difference each |
| `symmetricDifference` | their sum |
| `archipelagoFlips` / `pulseFlips` | status flips each feed recorded in its own namespace since the previous line |

Both address sets are lowercased before the symmetric difference is taken: `archipelago-stats`
returns `peer.id` verbatim while `pulse-stats` normalises, so one EIP-55 wallet would otherwise be
counted in `onlyInArchipelago` *and* in `onlyInPulse` and read as a divergence that is pure casing.

The flip counters are per window: they reset on every tick, including a tick whose Redis read failed
(that window's flips are dropped with its line rather than added to the next one). `pulseFlips`
counts the transitions the shadow feed derived, not events published (in `both` the shadow feed
publishes nothing).

**The gate for step 3 is the set difference, not the flip counts.** A healthy window has a small,
stable `symmetricDifference` — only peers in flight between the two 5 s polls. The two flip counters
are *indicative, not comparable one-to-one*: the archipelago feed derives transitions the Pulse feed
structurally does not, so a perfectly healthy window shows more archipelago flips than Pulse ones.

- A world exit publishes `peer.<addr>.world.leave`, mapped to OFFLINE, and the next client heartbeat
  maps back to ONLINE: **two** archipelago flips. On the Pulse side the same exit is one non-null
  entry for the new realm, i.e. ONLINE for a peer already ONLINE: **zero** flips.
- `peer.*.connect` is also mapped to OFFLINE, so wherever that subject is still published a connect
  costs two archipelago flips against Pulse's one.

So a window with 100 connects, 100 disconnects and 100 world exits reads `archipelagoFlips: 400,
pulseFlips: 200` with both feeds working. What the counters are for is liveness, one direction only:
`pulseFlips: 0` while `archipelagoFlips > 0` means the `engine.parcel_changes` subscription is dead.
Do not normalise the ratio and do not delay the switch over a 2x gap.

### Known exposure: a dropped OFFLINE (follow-up)

`peer-status:` is written only by the event path. If a batch is lost — an `MGET` rejection, a decode
error, a NATS gap — the peer stays cached `ONLINE` until `STATUS_CACHE_TTL_IN_SECONDS` (1 h) expires,
because Pulse never repeats an exit entry and the 5 s `/peers?all=true` poll refreshes the peer
*sets* but never the status cache. This is the same exposure as today's `peer.*.disconnect` path, so
it is recorded rather than fixed here; reconciling the status cache from the 5 s poll is a follow-up
to take if metrics show stuck-`ONLINE` peers.

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
| `PULSE_URL` | — | Pulse base URL. Required when `PRESENCE_SOURCE` is `pulse` or `both`, and validated at boot: it must parse as an absolute `http(s)` URL or component creation throws. Deliberately **commented out** in `.env.default`, because that file is a live config source inside the image and a placeholder there would satisfy the check. |
| `ARCHIPELAGO_STATS_URL` | — | Stays until `PRESENCE_SOURCE` is removed. Required when `PRESENCE_SOURCE` is `archipelago` or `both`. |
| `PEER_SYNC_INTERVAL_MS` | `5000` | Reconciliation poll interval, both sources. |
| `PEERS_SYNC_CACHE_TTL_MS` | `10000` | TTL of the reconciled peer sets. |
| `STATUS_CACHE_TTL_IN_SECONDS` | `3600` | TTL of `peer-status:<address>` and of the shadow `peer-status-pulse:<address>`, the per-peer dedupe caches. |

## Rollout

1. Deploy with `PRESENCE_SOURCE` unset (`archipelago`) — no behaviour change.
2. Set `PULSE_URL` **on every task definition that will ever run `both` or `pulse`** — from here on
   startup fails without it, and fails just as loudly on a value that is not an absolute `http(s)`
   URL. Switch to `both` and watch `Presence source diff`. Nothing is served or published from Pulse
   in this step.
3. Switch to `pulse` once `symmetricDifference` is stable and small. That is the gate; the flip
   counters are not comparable one-to-one (see above) — use them only to confirm `pulseFlips > 0`.
4. Rollback at any point is a single environment variable.
5. (Step 8 of the programme rollout) delete `worlds-stats`, `archipelago-stats`,
   `ARCHIPELAGO_STATS_URL` and the flag.
