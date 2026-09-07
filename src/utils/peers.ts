import { IConfigComponent } from '@well-known-components/interfaces'

/** All-realms peer set reconciled from archipelago-stats `GET /peers`. */
export const PEERS_CACHE_KEY = 'connected-peers'

/** All-realms peer set reconciled from Pulse `GET /peers?all=true`. */
export const PEERS_CACHE_KEY_PULSE = 'connected-peers-pulse'

/**
 * @deprecated Iteration 2 / WP4. The Pulse feed carries the realm of every peer, so world peers
 * need no separate set. Kept for `PRESENCE_SOURCE=archipelago|both`; deleted with
 * `src/adapters/worlds-stats.ts` at rollout step 8. See `docs/presence-sources.md`.
 */
export const WORLD_PEERS_CACHE_KEY = 'world-connected-peers'

/**
 * Where online-player information comes from. See `docs/presence-sources.md`.
 *
 * - `archipelago`: the five `peer.*` NATS subjects + archipelago-stats `GET /peers` (today).
 * - `pulse`: one `engine.parcel_changes` subscription + Pulse `GET /peers?all=true`.
 * - `both`: the dual-source window — both feeds run, both caches are filled, reads still come from
 *   the archipelago set and the difference between the two is logged every minute.
 */
export enum PresenceSource {
  ARCHIPELAGO = 'archipelago',
  PULSE = 'pulse',
  BOTH = 'both'
}

/** Today's behaviour: a deploy with no configuration change must not switch source. */
export const DEFAULT_PRESENCE_SOURCE = PresenceSource.ARCHIPELAGO

const PRESENCE_SOURCES = new Set<string>(Object.values(PresenceSource))

export function parsePresenceSource(value?: string | null): PresenceSource {
  const normalized = value?.trim().toLowerCase()

  return normalized && PRESENCE_SOURCES.has(normalized) ? (normalized as PresenceSource) : DEFAULT_PRESENCE_SOURCE
}

export async function getPresenceSource(config: IConfigComponent): Promise<PresenceSource> {
  return parsePresenceSource(await config.getString('PRESENCE_SOURCE'))
}

export function usesArchipelagoPresence(source: PresenceSource): boolean {
  return source === PresenceSource.ARCHIPELAGO || source === PresenceSource.BOTH
}

export function usesPulsePresence(source: PresenceSource): boolean {
  return source === PresenceSource.PULSE || source === PresenceSource.BOTH
}
