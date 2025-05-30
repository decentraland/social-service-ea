import SQL from 'sql-template-strings'
import { AppComponents, ICommunitiesDatabaseComponent, CommunityRole } from '../types'
import {
  Community,
  CommunityDB,
  GetCommunitiesOptions,
  CommunityWithMembersCountAndFriends,
  CommunityPublicInformation
} from '../logic/community'

import { normalizeAddress } from '../utils/address'
import { randomUUID } from 'node:crypto'
import {
  useCTEs,
  getUserFriendsCTE,
  searchCommunitiesQuery,
  getCommunitiesWithMembersCountCTE,
  withSearchAndPagination
} from '../logic/queries'

export function createCommunitiesDBComponent(
  components: Pick<AppComponents, 'pg' | 'logs'>
): ICommunitiesDatabaseComponent {
  const { pg } = components

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
      return result.rows[0]
    },

    async getCommunityMembersCount(communityId) {
      const query = SQL`
        SELECT COUNT(cm.member_address) 
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
      return pg.getCount(query)
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

    async getCommunities(memberAddress: string, options: GetCommunitiesOptions) {
      const normalizedMemberAddress = normalizeAddress(memberAddress)

      const communityFriendsCTE = SQL`
        SELECT 
          c.id as community_id,
          (
            SELECT array_agg(address ORDER BY address)
            FROM (
              SELECT DISTINCT uf.address
              FROM user_friends uf
              JOIN community_members cm ON cm.member_address = uf.address
              WHERE cm.community_id = c.id
              LIMIT 3
            ) subq
          ) as friends
        FROM communities c
        WHERE c.active = true
      `

      const baseQuery = useCTEs([
        getUserFriendsCTE(normalizedMemberAddress),
        getCommunitiesWithMembersCountCTE(),
        {
          query: communityFriendsCTE,
          name: 'community_friends'
        }
      ]).append(
        SQL`
        SELECT 
          c.id,
          c.name,
          c.description,
          c.owner_address as "ownerAddress",
          COALESCE(cm.role, ${CommunityRole.None}) as role,
          CASE WHEN c.private THEN 'private' ELSE 'public' END as privacy,
          c.active,
          cwmc."membersCount",
          COALESCE(cf.friends, ARRAY[]::text[]) as friends
        FROM communities c
        LEFT JOIN communities_with_members_count cwmc ON c.id = cwmc.id
        LEFT JOIN community_members cm ON c.id = cm.community_id AND cm.member_address = ${normalizedMemberAddress}
        LEFT JOIN community_bans cb ON c.id = cb.community_id AND cb.banned_address = ${normalizedMemberAddress}
        LEFT JOIN community_friends cf ON c.id = cf.community_id
        WHERE cb.banned_address IS NULL AND c.active = true`
      )

      const query = withSearchAndPagination(baseQuery, {
        onlyPublic: false,
        ...options
      })

      const result = await pg.query<CommunityWithMembersCountAndFriends>(query)
      return result.rows
    },

    async getCommunitiesCount(memberAddress: string, options: Pick<GetCommunitiesOptions, 'search'>) {
      const { search } = options ?? {}
      const normalizedMemberAddress = normalizeAddress(memberAddress)

      const query = SQL`
        SELECT COUNT(1) as count
          FROM communities c
          LEFT JOIN community_bans cb ON c.id = cb.community_id AND cb.banned_address = ${normalizedMemberAddress}
        WHERE cb.banned_address IS NULL
          AND c.active = true
      `

      if (search) {
        query.append(searchCommunitiesQuery(search))
      }

      return pg.getCount(query)
    },

    async getCommunitiesPublicInformation(options: GetCommunitiesOptions) {
      const baseQuery = useCTEs([getCommunitiesWithMembersCountCTE({ onlyPublic: true })]).append(
        SQL`
        SELECT 
          c.id,
          c.name,
          c.description,
          c.owner_address as "ownerAddress",
          CASE WHEN c.private THEN 'private' ELSE 'public' END as privacy,
          c.active,
          cwmc."membersCount"
        FROM communities c
        LEFT JOIN communities_with_members_count cwmc ON c.id = cwmc.id
        WHERE c.active = true AND c.private = false`
      )

      const query = withSearchAndPagination(baseQuery, {
        onlyPublic: true,
        ...options
      })

      const result = await pg.query<CommunityPublicInformation>(query)
      return result.rows
    },

    async getPublicCommunitiesCount(options: Pick<GetCommunitiesOptions, 'search'>) {
      const { search } = options ?? {}

      const query = SQL`
        SELECT COUNT(1) as count
          FROM communities c
        WHERE c.active = true AND c.private = false
      `

      if (search) {
        query.append(searchCommunitiesQuery(search))
      }

      return pg.getCount(query)
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
      await pg.query(query)
    }
  }
}
