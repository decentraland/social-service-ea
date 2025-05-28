import SQL from 'sql-template-strings'
import { AppComponents, CommunityMember, ICommunitiesDatabaseComponent, Pagination } from '../types'

export function createCommunitiesDBComponent(
  components: Pick<AppComponents, 'pg' | 'logs'>
): ICommunitiesDatabaseComponent {
  const { pg, logs } = components

  const logger = logs.getLogger('communities-db-component')

  async function communityExists(communityId: string): Promise<boolean> {
    const query = SQL`
      SELECT EXISTS (
        SELECT 1 FROM communities
        WHERE id = ${communityId}
      ) AS "exists"
    `
    const result = await pg.query<{ exists: boolean }>(query)
    return result.rows[0]?.exists ?? false
  }

  async function getCommunityMembers(communityId: string, pagination?: Pagination): Promise<CommunityMember[]> {
    const query = SQL`
      SELECT 
        cm.id,
        cm.community_id AS "communityId",
        cm.member_address AS "memberAddress",
        cm.role,
        cm.joined_at AS "joinedAt"
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
    if (pagination) {
      query.append(SQL` LIMIT ${pagination.limit} OFFSET ${pagination.offset}`)
    }
    const result = await pg.query(query)
    return result.rows as CommunityMember[]
  }

  async function getCommunityMembersCount(communityId: string): Promise<number> {
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
    const result = await pg.query(query)
    return Number(result.rows[0].count)
  }

  return {
    communityExists,
    getCommunityMembers,
    getCommunityMembersCount
  }
}
