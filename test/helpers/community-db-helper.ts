import { IPgComponent } from '@well-known-components/pg-component'
import SQL from 'sql-template-strings'
import { normalizeAddress } from '../../src/utils/address'
import { ICommunitiesDbHelperComponent } from '../../src/types/components'

export function createDbHelper(pg: IPgComponent): ICommunitiesDbHelperComponent {
  return {
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
            WHERE community_id = ${communityId} AND member_address IN (${memberAddresses.map(address => normalizeAddress(address))})
        `
        await pg.query(query)
    }
  }
}
