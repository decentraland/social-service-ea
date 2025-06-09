import SQL from 'sql-template-strings'
import { AppComponents, ICommunitiesDatabaseComponent, CommunityRole, Pagination } from '../types'
import {
  Community,
  CommunityDB,
  GetCommunitiesOptions,
  CommunityWithMembersCountAndFriends,
  CommunityPublicInformation,
  CommunityMember,
  MemberCommunity,
  BannedMember
} from '../logic/community'

import { normalizeAddress } from '../utils/address'
import { randomUUID } from 'node:crypto'
import {
  useCTEs,
  getUserFriendsCTE,
  searchCommunitiesQuery,
  getCommunitiesWithMembersCountCTE,
  withSearchAndPagination,
  getLatestFriendshipActionCTE,
  getMembersCTE,
  CTE
} from '../logic/queries'
import { EthAddress } from '@dcl/schemas'

export function createCommunitiesDBComponent(
  components: Pick<AppComponents, 'pg' | 'logs'>
): ICommunitiesDatabaseComponent {
  const { pg } = components

  return {
    async communityExists(
      communityId: string,
      { onlyPublic = false }: { onlyPublic?: boolean } = {}
    ): Promise<boolean> {
      const query = SQL`
        SELECT EXISTS (
          SELECT 1 FROM communities
          WHERE id = ${communityId} AND active = true
      `
        .append(onlyPublic ? SQL` AND private <> true` : SQL``)
        .append(SQL`) AS "exists"`)

      return pg.exists(query, 'exists')
    },

    async isMemberOfCommunity(communityId: string, userAddress: EthAddress): Promise<boolean> {
      const query = SQL`
        SELECT EXISTS (
          SELECT 1 FROM community_members cm
          WHERE cm.community_id = ${communityId} AND cm.member_address = ${normalizeAddress(userAddress)}
        ) AS "isMember"
      `
      return pg.exists(query, 'isMember')
    },

    async getCommunity(id: string, userAddress: EthAddress): Promise<Community & { role: CommunityRole }> {
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

      const result = await pg.query<Community & { role: CommunityRole }>(query)
      return result.rows[0]
    },

    async getCommunityMembers(
      id: string,
      options: { userAddress: EthAddress; pagination: Pagination }
    ): Promise<CommunityMember[]> {
      const { userAddress, pagination } = options
      const normalizedUserAddress = userAddress ? normalizeAddress(userAddress) : null

      const ctes = [
        getMembersCTE(SQL`SELECT member_address FROM community_members WHERE community_id = ${id}`),
        normalizedUserAddress && getLatestFriendshipActionCTE(normalizedUserAddress)
      ].filter(Boolean) as CTE[]

      const query = useCTEs(ctes)
        .append(
          SQL`SELECT cm.community_id AS "communityId", cm.member_address AS "memberAddress", cm.role AS "role", cm.joined_at AS "joinedAt"`
        )
        .append(
          normalizedUserAddress ? SQL`, lfa.action AS "lastFriendshipAction", lfa.acting_user AS "actingUser"` : SQL``
        )
        .append(SQL` FROM community_members cm`)
        .append(
          normalizedUserAddress
            ? SQL` LEFT JOIN latest_friendship_actions lfa ON lfa.other_user = cm.member_address`
            : SQL``
        )
        .append(SQL` WHERE cm.community_id = ${id}`)
        .append(SQL` ORDER BY cm.joined_at ASC`)
        .append(SQL` LIMIT ${pagination.limit}`)
        .append(SQL` OFFSET ${pagination.offset}`)

      const result = await pg.query<CommunityMember>(query)
      return result.rows
    },

    async getCommunityMemberRole(id: string, userAddress: EthAddress): Promise<CommunityRole> {
      const roles = await this.getCommunityMemberRoles(id, [userAddress])
      return roles[userAddress] ?? CommunityRole.None
    },

    async getCommunityMemberRoles(id: string, userAddresses: EthAddress[]): Promise<Record<string, CommunityRole>> {
      const normalizedUserAddresses = userAddresses.map(normalizeAddress)

      const query = SQL`
        SELECT cm.member_address AS "memberAddress", cm.role AS "role"
        FROM community_members cm
        WHERE cm.community_id = ${id}
          AND cm.member_address = ANY(${normalizedUserAddresses})
      `
      const result = await pg.query<{ memberAddress: string; role: CommunityRole }>(query)
      return result.rows.reduce(
        (acc, row) => {
          acc[row.memberAddress] = row.role ?? CommunityRole.None
          return acc
        },
        {} as Record<string, CommunityRole>
      )
    },

    async getCommunityMembersCount(communityId: string): Promise<number> {
      const query = SQL`
        SELECT COUNT(cm.member_address) 
          FROM community_members cm
          WHERE cm.community_id = ${communityId}
              AND EXISTS (
                  SELECT 1 
                  FROM communities c 
                  WHERE c.id = cm.community_id 
                  AND c.active = true
              )
      `
      return pg.getCount(query)
    },

    async getCommunityPlaces(communityId: string): Promise<string[]> {
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

    async getCommunities(
      memberAddress: EthAddress,
      options: GetCommunitiesOptions
    ): Promise<CommunityWithMembersCountAndFriends[]> {
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

      const membersJoin = options.onlyMemberOf
        ? SQL` JOIN community_members cm ON c.id = cm.community_id AND cm.member_address = ${normalizedMemberAddress}`
        : SQL` LEFT JOIN community_members cm ON c.id = cm.community_id AND cm.member_address = ${normalizedMemberAddress}`

      const baseQuery = useCTEs([
        getUserFriendsCTE(normalizedMemberAddress),
        getCommunitiesWithMembersCountCTE(),
        {
          query: communityFriendsCTE,
          name: 'community_friends'
        }
      ])
        .append(
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
        `
        )
        .append(membersJoin).append(SQL`
        LEFT JOIN communities_with_members_count cwmc ON c.id = cwmc.id
        LEFT JOIN community_friends cf ON c.id = cf.community_id
        LEFT JOIN community_bans cb ON c.id = cb.community_id AND cb.banned_address = ${normalizedMemberAddress} AND cb.active = true
        WHERE c.active = true AND cb.banned_address IS NULL`)

      const query = withSearchAndPagination(baseQuery, {
        ...options,
        sortBy: options.onlyMemberOf ? 'role' : 'membersCount'
      })

      const result = await pg.query<CommunityWithMembersCountAndFriends>(query)
      return result.rows
    },

    async getCommunitiesCount(
      memberAddress: EthAddress,
      options?: Pick<GetCommunitiesOptions, 'search' | 'onlyMemberOf'>
    ): Promise<number> {
      const { search, onlyMemberOf } = options ?? {}
      const normalizedMemberAddress = normalizeAddress(memberAddress)

      const membersJoin = onlyMemberOf
        ? SQL` JOIN community_members cm ON c.id = cm.community_id AND cm.member_address = ${normalizedMemberAddress}`
        : SQL``

      const query = SQL`SELECT COUNT(1) as count FROM communities c`.append(membersJoin).append(SQL`
        LEFT JOIN community_bans cb ON c.id = cb.community_id AND cb.banned_address = ${normalizedMemberAddress} AND cb.active = true
        WHERE c.active = true AND cb.banned_address IS NULL
      `)

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

      const query = withSearchAndPagination(baseQuery, options)

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

    async getMemberCommunities(
      memberAddress: EthAddress,
      options: Pick<GetCommunitiesOptions, 'pagination'>
    ): Promise<MemberCommunity[]> {
      const normalizedMemberAddress = normalizeAddress(memberAddress)

      const baseQuery = SQL`
        SELECT 
          c.id,
          c.name,
          c.owner_address as "ownerAddress",
          COALESCE(cm.role, ${CommunityRole.None}) as role
        FROM communities c
        JOIN community_members cm ON c.id = cm.community_id AND cm.member_address = ${normalizedMemberAddress}
        WHERE c.active = true
      `

      const query = withSearchAndPagination(baseQuery, {
        sortBy: 'role',
        ...options
      })

      const result = await pg.query<MemberCommunity>(query)
      return result.rows
    },

    async createCommunity(community: CommunityDB): Promise<Community> {
      const id = randomUUID()
      const query = SQL`
        INSERT INTO communities (id, name, description, owner_address, private, active)
        VALUES (${id}, ${community.name}, ${community.description}, ${normalizeAddress(community.owner_address)}, ${community.private || false}, ${community.active || true})
        RETURNING id, name, description, owner_address, private, active, created_at, updated_at
        `
      const result = await pg.query(query)
      const row = result.rows[0]
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        ownerAddress: row.owner_address,
        privacy: row.private ? 'private' : 'public',
        active: row.active
      }
    },

    async deleteCommunity(id: string): Promise<void> {
      const query = SQL`UPDATE communities SET active = false WHERE id = ${id}`
      await pg.query(query)
    },

    async addCommunityMember(member: Omit<CommunityMember, 'joinedAt'>): Promise<void> {
      const query = SQL`
        INSERT INTO community_members (community_id, member_address, role)
        VALUES (${member.communityId}, ${normalizeAddress(member.memberAddress)}, ${member.role})
      `
      await pg.query(query)
    },

    async kickMemberFromCommunity(communityId: string, memberAddress: EthAddress): Promise<void> {
      const query = SQL`
        DELETE FROM community_members WHERE community_id = ${communityId} AND member_address = ${normalizeAddress(memberAddress)}
      `
      await pg.query(query)
    },

    async banMemberFromCommunity(
      communityId: string,
      bannedBy: EthAddress,
      bannedMemberAddress: EthAddress
    ): Promise<void> {
      const query = SQL`
        INSERT INTO community_bans (community_id, banned_address, banned_by, active)
        VALUES (${communityId}, ${normalizeAddress(bannedMemberAddress)}, ${normalizeAddress(bannedBy)}, true)
        ON CONFLICT (community_id, banned_address) 
        DO UPDATE SET active = true
      `
      await pg.query(query)
    },

    async unbanMemberFromCommunity(
      communityId: string,
      unbannedBy: EthAddress,
      unbannedMemberAddress: EthAddress
    ): Promise<void> {
      const query = SQL`
        UPDATE community_bans 
        SET active = false, unbanned_by = ${normalizeAddress(unbannedBy)}, unbanned_at = now()
        WHERE community_id = ${communityId} 
          AND banned_address = ${normalizeAddress(unbannedMemberAddress)}
          AND active = true
      `
      await pg.query(query)
    },

    async isMemberBanned(communityId: string, memberAddress: EthAddress): Promise<boolean> {
      const query = SQL`
        SELECT EXISTS (
          SELECT 1 FROM community_bans
          WHERE community_id = ${communityId} 
          AND banned_address = ${normalizeAddress(memberAddress)}
          AND active = true
        ) AS "isBanned"
      `
      return pg.exists(query, 'isBanned')
    },

    async getBannedMembers(
      communityId: string,
      userAddress: EthAddress,
      pagination: Pagination
    ): Promise<BannedMember[]> {
      const normalizedUserAddress = normalizeAddress(userAddress)

      const query = useCTEs([
        getMembersCTE(
          SQL`SELECT banned_address as member_address FROM community_bans WHERE community_id = ${communityId}`
        ),
        getLatestFriendshipActionCTE(normalizedUserAddress)
      ])
        .append(
          SQL`
        SELECT 
          cb.community_id AS "communityId",
          cb.banned_address AS "memberAddress",
          cb.banned_at AS "bannedAt",
          lfa.action AS "lastFriendshipAction",
          lfa.acting_user AS "actingUser"
        FROM community_bans cb
        LEFT JOIN latest_friendship_actions lfa ON lfa.other_user = cb.banned_address
        WHERE cb.community_id = ${communityId}
          AND cb.active = true
        ORDER BY cb.banned_at ASC
      `
        )
        .append(SQL` LIMIT ${pagination.limit} OFFSET ${pagination.offset}`)

      const result = await pg.query<BannedMember>(query)
      return result.rows
    },

    async getBannedMembersCount(communityId: string): Promise<number> {
      const query = SQL`
        SELECT COUNT(banned_address) 
        FROM community_bans
        WHERE community_id = ${communityId}
          AND active = true
      `
      return pg.getCount(query)
    }
  }
}
