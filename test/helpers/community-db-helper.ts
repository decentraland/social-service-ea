import { IPgComponent } from '@dcl/pg-component'
import SQL from 'sql-template-strings'
import { normalizeAddress } from '../../src/utils/address'
import { ICommunitiesDbHelperComponent } from '../../src/types/components'

export function createDbHelper(pg: IPgComponent): ICommunitiesDbHelperComponent {
  return {
    async forceRankingMetricValue(communityId: string, metric: string, value: number): Promise<void> {
      // The adapter clamps every contribution, so a counter can only reach the top of the column
      // from data written before that clamp existed. Seed it directly to reproduce such a row.
      await pg.query(
        SQL`INSERT INTO community_ranking_metrics (community_id, `
          .append(metric)
          .append(SQL`) VALUES (${communityId}, ${value}) ON CONFLICT (community_id) DO UPDATE SET `)
          .append(metric)
          .append(SQL` = ${value}`)
      )
    },

    async getRankingMetricValue(communityId: string, metric: string): Promise<number | undefined> {
      const result = await pg.query<Record<string, number>>(
        SQL`SELECT `.append(metric).append(SQL` FROM community_ranking_metrics WHERE community_id = ${communityId}`)
      )
      return result.rows[0]?.[metric]
    },

    async forceCommunityRemoval(communityId: string): Promise<void> {
      const query = SQL`
            DELETE FROM communities
            WHERE id = ${communityId}
        `
      await pg.query(query)
    },

    async forceCommunityMemberRemoval(communityId: string, memberAddresses: string[]): Promise<void> {
      const query = SQL`
            DELETE FROM community_members
            WHERE community_id = ${communityId} AND member_address IN (${memberAddresses.map((address) => normalizeAddress(address))})
        `
      await pg.query(query)
    },

    async forceCommunityRequestRemoval(requestId: string): Promise<void> {
      const query = SQL`
            DELETE FROM community_requests
            WHERE id = ${requestId}
        `
      await pg.query(query)
    },

    async updateCommunityRequestStatus(requestId: string, status: string): Promise<void> {
      const query = SQL`
            UPDATE community_requests 
            SET status = ${status}
            WHERE id = ${requestId}
        `
      await pg.query(query)
    }
  }
}
