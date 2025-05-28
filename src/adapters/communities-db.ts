import SQL from 'sql-template-strings'
import {
  AppComponents,
  ICommunitiesDatabaseComponent,
  Community,
  Pagination,
  CommunityWithMembersCount,
  CommunityRole,
  CommunityDB
} from '../types'
import { normalizeAddress } from '../utils/address'
import { CommunityNotFoundError } from './errors'
import { randomUUID } from 'node:crypto'

export function createCommunitiesDBComponent(
  components: Pick<AppComponents, 'pg' | 'logs'>
): ICommunitiesDatabaseComponent {
  const { pg, logs } = components

  const logger = logs.getLogger('communities-db-component')

  return {
    async getCommunity(id: string, userAddress: string) {
      const query = SQL`
        SELECT 
          c.id,
          c.name,
          c.description,
          c.owner_address as "ownerAddress",
          COALESCE(cm.role, ${CommunityRole.None}) as role,
          CASE WHEN c.private THEN 'private' ELSE 'public' END as privacy,
          c.active
        FROM communities c
        LEFT JOIN community_members cm ON c.id = cm.community_id AND cm.member_address = ${normalizeAddress(userAddress)}
        WHERE c.id = ${id} AND c.active = true`

      const result = await pg.query<Community>(query)

      if (result.rows.length === 0) {
        throw new CommunityNotFoundError(`Community not found: ${id}`)
      }

      return result.rows[0]
    },

    async getCommunityMembersCount(communityId) {
      const query = SQL`
        SELECT COUNT(DISTINCT cm.member_address) 
          FROM community_members cm
          LEFT JOIN community_bans cb ON cm.member_address = cb.banned_address 
              AND cb.community_id = cm.community_id
              AND cb.active = true
          WHERE cm.community_id = ${communityId}
              AND cb.banned_address IS NULL
              AND EXISTS (
                  SELECT 1 
                  FROM communities c 
                  WHERE c.id = cm.community_id 
                  AND c.active = true
              )
      `
      const result = await pg.query<{ count: number }>(query)
      return result.rows[0].count
    },

    async getCommunityPlaces(communityId: string) {
      const query = SQL`
        SELECT 
          CASE 
            WHEN place_type = 'parcel' THEN position
            ELSE world_name
          END as place
        FROM community_places
        WHERE community_id = ${communityId}`
      const result = await pg.query<{ place: string }>(query)
      return result.rows.map((row) => row.place)
    },

    async getCommunities(memberAddress: string, options?: { pagination?: Pagination }) {
      const { pagination = { limit: 10, offset: 0 } } = options ?? {}
      const query = SQL`
        SELECT 
          id,
          name,
          description,
          owner_address as ownerAddress,
          role,
          CASE WHEN private THEN 'private' ELSE 'public' END as privacy,
          active,
          (SELECT COUNT(DISTINCT cm.member_address) 
            FROM community_members cm
            LEFT JOIN community_bans cb ON cm.member_address = cb.banned_address 
                AND cb.community_id = cm.community_id
                AND cb.active = true
            WHERE cm.community_id = communities.id
            AND cb.banned_address IS NULL) as membersCount
        FROM communities WHERE active = true
        LEFT JOIN community_members cm ON communities.id = cm.community_id AND cm.member_address = ${normalizeAddress(memberAddress)}
        LEFT JOIN community_bans cb ON communities.id = cb.community_id AND cb.banned_address = ${normalizeAddress(memberAddress)}
        WHERE cb.banned_address IS NULL
        ORDER BY membersCount DESC
        LIMIT ${pagination.limit}
        OFFSET ${pagination.offset}
      `
      const result = await pg.query<CommunityWithMembersCount>(query)
      return result.rows
    },

    async getCommunitiesCount(memberAddress: string) {
      const query = SQL`
        SELECT COUNT(*)
          FROM communities c
          LEFT JOIN community_members cm ON c.id = cm.community_id AND cm.member_address = ${normalizeAddress(memberAddress)}
          LEFT JOIN community_bans cb ON c.id = cb.community_id AND cb.banned_address = ${normalizeAddress(memberAddress)}
        WHERE cb.banned_address IS NULL
          AND c.active = true
      `
      const result = await pg.query<{ count: number }>(query)
      return Number(result.rows[0].count)
    },

    async createCommunity(community: CommunityDB) {
      const id = randomUUID()
      const query = SQL`
        INSERT INTO communities (id, name, description, owner_address, private, active)
        VALUES (${id}, ${community.name}, ${community.description}, ${normalizeAddress(community.owner_address)}, ${community.private || false}, ${community.active || true})
        RETURNING id`
      const result = await pg.query<{ id: string }>(query)
      return result.rows[0]
    },

    async deleteCommunity(id) {
      const query = SQL`UPDATE communities SET active = false WHERE id = ${id}`
      const result = await pg.query(query)

      if (result.rowCount === 0) {
        throw new CommunityNotFoundError(`Community not found: ${id}`)
      }
    }
  }
}
