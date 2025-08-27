import SQL from 'sql-template-strings'
import { AppComponents, ICommunitiesDatabaseComponent, CommunityRole, Pagination } from '../types'
import {
  Community,
  CommunityDB,
  GetCommunitiesOptions,
  AggregatedCommunityWithMemberAndFriendsData,
  CommunityPublicInformation,
  CommunityMember,
  MemberCommunity,
  BannedMember,
  CommunityPlace,
  CommunityPrivacyEnum,
  CommunityRequestType,
  MemberRequest,
  CommunityRequestStatus,
  GetCommunityRequestsOptions,
  CommunityForModeration
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
  getCommunityMembersJoin,
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

    async getCommunity(id: string, userAddress?: EthAddress): Promise<Community & { role: CommunityRole }> {
      const normalizedUserAddress = userAddress ? normalizeAddress(userAddress) : null
      const query = SQL`
        SELECT 
          c.id,
          c.name,
          c.description,
          c.owner_address as "ownerAddress",
          CASE WHEN c.private THEN 'private' ELSE 'public' END as privacy,
          c.active,
      `
        .append(
          normalizedUserAddress
            ? SQL` COALESCE(cm.role, ${CommunityRole.None}) as role`
            : SQL` ${CommunityRole.None} as role`
        )
        .append(SQL` FROM communities c`)
        .append(
          normalizedUserAddress
            ? SQL` LEFT JOIN community_members cm ON c.id = cm.community_id AND cm.member_address = ${normalizedUserAddress}`
            : SQL``
        )
        .append(SQL` WHERE c.id = ${id} AND c.active = true`)

      const result = await pg.query<Community & { role: CommunityRole }>(query)
      return result.rows[0]
    },

    async getCommunityMembers(
      id: string,
      options: { userAddress: EthAddress; pagination: Pagination; filterByMembers?: string[] }
    ): Promise<CommunityMember[]> {
      const { userAddress, pagination, filterByMembers } = options
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
        .append(filterByMembers ? SQL` AND cm.member_address = ANY(${filterByMembers.map(normalizeAddress)})` : SQL``)
        .append(SQL` ORDER BY cm.joined_at ASC`)
        .append(SQL` LIMIT ${pagination.limit}`)
        .append(SQL` OFFSET ${pagination.offset}`)

      const result = await pg.query<CommunityMember>(query)
      return result.rows
    },

    async getCommunityMemberRole(id: string, userAddress: EthAddress): Promise<CommunityRole> {
      const normalizedUserAddress = normalizeAddress(userAddress)
      const roles = await this.getCommunityMemberRoles(id, [normalizedUserAddress])
      return roles[normalizedUserAddress] ?? CommunityRole.None
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

    async getCommunityMembersCount(communityId: string, options?: { filterByMembers?: string[] }): Promise<number> {
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

      if (options && options.filterByMembers) {
        query.append(SQL` AND cm.member_address = ANY(${options.filterByMembers.map(normalizeAddress)})`)
      }

      return pg.getCount(query)
    },

    async getCommunityPlaces(communityId: string, pagination?: Pagination): Promise<Pick<CommunityPlace, 'id'>[]> {
      const query = SQL`
        SELECT id
        FROM community_places
        WHERE community_id = ${communityId}
        ORDER BY added_at DESC
        `

      if (pagination?.limit) {
        query.append(SQL` LIMIT ${pagination.limit}`)
      }

      if (pagination?.offset) {
        query.append(SQL` OFFSET ${pagination.offset}`)
      }

      const result = await pg.query<Pick<CommunityPlace, 'id'>>(query)
      return result.rows
    },

    async getCommunityPlacesCount(communityId: string): Promise<number> {
      const query = SQL`
        SELECT COUNT(1)
        FROM community_places
        WHERE community_id = ${communityId}
      `
      return pg.getCount(query)
    },

    async addCommunityPlace(place: Omit<CommunityPlace, 'addedAt'>): Promise<void> {
      await this.addCommunityPlaces([place])
    },

    async communityPlaceExists(communityId: string, placeId: string): Promise<boolean> {
      const query = SQL`
        SELECT EXISTS (
          SELECT 1 FROM community_places WHERE id = ${placeId} AND community_id = ${communityId}
        ) AS "exists"
      `

      return pg.exists(query, 'exists')
    },

    async addCommunityPlaces(places: Omit<CommunityPlace, 'addedAt'>[]): Promise<void> {
      if (places.length === 0) return

      const query = SQL`
        INSERT INTO community_places (id, community_id, added_by)
        VALUES 
      `

      places.forEach((place, index) => {
        query.append(SQL`(${place.id}, ${place.communityId}, ${normalizeAddress(place.addedBy)})`)
        if (index < places.length - 1) {
          query.append(SQL`, `)
        }
      })

      query.append(SQL` ON CONFLICT (id, community_id) DO NOTHING`)

      await pg.query(query)
    },

    async removeCommunityPlace(communityId: string, placeId: string): Promise<void> {
      const query = SQL`
        DELETE FROM community_places WHERE id = ${placeId} AND community_id = ${communityId}
      `
      await pg.query(query)
    },

    async removeCommunityPlacesWithExceptions(communityId: string, exceptPlaceIds: string[]): Promise<void> {
      const query = SQL`DELETE FROM community_places WHERE community_id = ${communityId}`

      if (exceptPlaceIds.length > 0) {
        query.append(SQL` AND id <> ANY(${exceptPlaceIds})`)
      }

      await pg.query(query)
    },

    async getCommunities(
      memberAddress: EthAddress,
      options: GetCommunitiesOptions
    ): Promise<AggregatedCommunityWithMemberAndFriendsData[]> {
      const { onlyMemberOf, roles, communityIds } = options

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

      const membersJoin = getCommunityMembersJoin(normalizedMemberAddress, { onlyMemberOf, roles })

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

      // Filter by specific community IDs if provided
      if (communityIds && communityIds.length > 0) {
        baseQuery.append(SQL` AND c.id = ANY(${communityIds})`)
      }

      const query = withSearchAndPagination(baseQuery, {
        ...options,
        sortBy: options.onlyMemberOf ? 'role' : 'membersCount'
      })

      const result = await pg.query<AggregatedCommunityWithMemberAndFriendsData>(query)
      return result.rows
    },

    async getCommunitiesCount(
      memberAddress: EthAddress,
      options?: Pick<GetCommunitiesOptions, 'search' | 'onlyMemberOf' | 'roles'>
    ): Promise<number> {
      const { search, onlyMemberOf, roles } = options ?? {}
      const normalizedMemberAddress = normalizeAddress(memberAddress)

      const membersJoin = getCommunityMembersJoin(normalizedMemberAddress, { onlyMemberOf, roles })

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

      const result = await pg.query<Omit<CommunityPublicInformation, 'ownerName'>>(query)
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
      options: Pick<GetCommunitiesOptions, 'pagination' | 'roles'>
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
      `
        .append(options.roles ? SQL` AND cm.role = ANY(${options.roles})` : SQL``)
        .append(SQL` WHERE c.active = true`)

      const query = withSearchAndPagination(baseQuery, {
        sortBy: 'role',
        ...options
      })

      const result = await pg.query<MemberCommunity>(query)
      return result.rows
    },

    async getCommunityInvites(inviter: EthAddress, invitee: EthAddress): Promise<Community[]> {
      const normalizedInviterAddress = normalizeAddress(inviter)
      const normalizedInviteeAddress = normalizeAddress(invitee)

      const query = SQL`
        SELECT 
          c.id,
          c.name,
          c.description,
          c.owner_address as "ownerAddress",
          CASE WHEN c.private = true THEN ${CommunityPrivacyEnum.Private} ELSE ${CommunityPrivacyEnum.Public} END as privacy,
          c.active
        FROM communities c
        JOIN community_members cm_inviter ON c.id = cm_inviter.community_id AND cm_inviter.member_address = ${normalizedInviterAddress}
        LEFT JOIN community_members cm_invitee ON c.id = cm_invitee.community_id AND cm_invitee.member_address = ${normalizedInviteeAddress}
        WHERE c.active = true
          AND cm_invitee.member_address IS NULL
        ORDER BY c.name ASC
      `

      const result = await pg.query<Community>(query)
      return result.rows
    },

    async getOnlineMembersFromUserCommunities(
      userAddress: EthAddress,
      onlineUsers: string[],
      pagination: Pagination
    ): Promise<Array<{ communityId: string; memberAddress: string }>> {
      if (onlineUsers.length === 0) {
        return []
      }

      const normalizedUserAddress = normalizeAddress(userAddress)

      const query = SQL`
        SELECT DISTINCT
          cm.community_id as "communityId",
          cm.member_address as "memberAddress"
        FROM community_members cm
        JOIN community_members ucm ON cm.community_id = ucm.community_id
        WHERE ucm.member_address = ${normalizedUserAddress}
          AND cm.member_address = ANY(${onlineUsers.map(normalizeAddress)})
          AND cm.member_address != ${normalizedUserAddress}
          AND EXISTS (
            SELECT 1 
            FROM communities c 
            WHERE c.id = cm.community_id 
            AND c.active = true
          )
        ORDER BY cm.community_id, cm.member_address
        LIMIT ${pagination.limit} OFFSET ${pagination.offset}
      `

      const result = await pg.query<{ communityId: string; memberAddress: string }>(query)
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
        privacy: row.private ? CommunityPrivacyEnum.Private : CommunityPrivacyEnum.Public,
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
    },

    async updateMemberRole(communityId: string, memberAddress: EthAddress, newRole: CommunityRole): Promise<void> {
      const query = SQL`
        UPDATE community_members 
        SET role = ${newRole}
        WHERE community_id = ${communityId} AND member_address = ${normalizeAddress(memberAddress)}
      `
      await pg.query(query)
    },

    async updateCommunity(
      communityId: string,
      updates: Partial<Pick<CommunityDB, 'name' | 'description' | 'private'>>
    ): Promise<Community> {
      let query = SQL`UPDATE communities SET `
      const setClauses: ReturnType<typeof SQL>[] = []

      if (updates.name !== undefined) {
        setClauses.push(SQL`name = ${updates.name}`)
      }

      if (updates.description !== undefined) {
        setClauses.push(SQL`description = ${updates.description}`)
      }

      if (updates.private !== undefined) {
        setClauses.push(SQL`private = ${updates.private}`)
      }

      setClauses.push(SQL`updated_at = now()`)

      // Join the SET clauses
      for (let i = 0; i < setClauses.length; i++) {
        query = query.append(setClauses[i])
        if (i < setClauses.length - 1) {
          query = query.append(SQL`, `)
        }
      }

      query = query
        .append(SQL` WHERE id = ${communityId} AND active = true`)
        .append(SQL` RETURNING id, name, description, owner_address, private, active, created_at, updated_at`)

      const result = await pg.query<CommunityDB>(query)
      const row = result.rows[0]

      if (!row) {
        throw new Error(`Community with id ${communityId} not found`)
      }

      return {
        id: row.id!,
        name: row.name,
        description: row.description,
        ownerAddress: row.owner_address,
        privacy: row.private ? CommunityPrivacyEnum.Private : CommunityPrivacyEnum.Public,
        active: row.active
      }
    },

    async createCommunityRequest(
      communityId: string,
      memberAddress: EthAddress,
      type: CommunityRequestType
    ): Promise<MemberRequest> {
      const id = randomUUID()
      const query = SQL`
        INSERT INTO community_requests (id, community_id, member_address, type, status)
        VALUES (${id}, ${communityId}, ${normalizeAddress(memberAddress)}, ${type}, ${CommunityRequestStatus.Pending})
        RETURNING id
      `

      const result = await pg.query(query)

      return {
        id: result.rows[0].id,
        communityId,
        memberAddress,
        type,
        status: CommunityRequestStatus.Pending
      }
    },

    async getMemberRequests(
      memberAddress: string,
      filters: Pick<GetCommunityRequestsOptions, 'status' | 'type' | 'pagination'>
    ): Promise<MemberRequest[]> {
      let query = SQL`
        SELECT id, community_id AS "communityId", member_address AS "memberAddress", type, status
        FROM community_requests
        WHERE member_address = ${normalizeAddress(memberAddress)}
      `

      if (filters.status) {
        query = query.append(SQL` AND status = ${filters.status}`)
      }

      if (filters.type) {
        query = query.append(SQL` AND type = ${filters.type}`)
      }

      query = query.append(SQL` ORDER BY created_at DESC`)

      query = query.append(SQL` LIMIT ${filters.pagination.limit} OFFSET ${filters.pagination.offset}`)

      const result = await pg.query<MemberRequest>(query)
      return result.rows
    },

    async getMemberRequestsCount(
      memberAddress: string,
      filters: Pick<GetCommunityRequestsOptions, 'status' | 'type'>
    ): Promise<number> {
      let query = SQL`
        SELECT COUNT(*) as count
        FROM community_requests
        WHERE member_address = ${normalizeAddress(memberAddress)}
      `

      if (filters.status) {
        query = query.append(SQL` AND status = ${filters.status}`)
      }

      if (filters.type) {
        query = query.append(SQL` AND type = ${filters.type}`)
      }

      return pg.getCount(query)
    },

    async getCommunityRequests(communityId: string, filters: GetCommunityRequestsOptions): Promise<MemberRequest[]> {
      let query = SQL`
        SELECT id, community_id AS "communityId", member_address AS "memberAddress", type, status
        FROM community_requests
        WHERE community_id = ${communityId}
      `

      if (filters.status) {
        query = query.append(SQL` AND status = ${filters.status}`)
      }

      if (filters.type) {
        query = query.append(SQL` AND type = ${filters.type}`)
      }

      if (filters.targetAddress) {
        query = query.append(SQL` AND member_address = ${normalizeAddress(filters.targetAddress)}`)
      }

      query = query.append(SQL` ORDER BY created_at DESC`)

      // Apply pagination
      query = query.append(SQL` LIMIT ${filters.pagination.limit} OFFSET ${filters.pagination.offset}`)

      const result = await pg.query<MemberRequest>(query)
      return result.rows
    },

    async getCommunityRequestsCount(
      communityId: string,
      filters: Pick<GetCommunityRequestsOptions, 'status' | 'type'>
    ): Promise<number> {
      let query = SQL`
        SELECT COUNT(*) as count
        FROM community_requests
        WHERE community_id = ${communityId}
      `

      if (filters.status) {
        query = query.append(SQL` AND status = ${filters.status}`)
      }

      if (filters.type) {
        query = query.append(SQL` AND type = ${filters.type}`)
      }

      return pg.getCount(query)
    },

    async getCommunityRequest(requestId: string): Promise<MemberRequest | undefined> {
      const query = SQL`
        SELECT id, community_id AS "communityId", member_address AS "memberAddress", type, status
        FROM community_requests
        WHERE id = ${requestId}
      `

      const result = await pg.query<MemberRequest>(query)
      return result.rows[0]
    },

    async removeCommunityRequest(requestId: string): Promise<void> {
      const query = SQL`
        DELETE FROM community_requests WHERE id = ${requestId}
      `
      await pg.query(query)
    },

    async acceptAllRequestsToJoin(communityId: string): Promise<void> {
      const query = SQL`
        INSERT INTO community_members (community_id, member_address, role)
        SELECT community_id, member_address, ${CommunityRole.Member}
        FROM community_requests
        WHERE community_id = ${communityId} AND type = ${CommunityRequestType.RequestToJoin}
      `
      await pg.query(query)
    },

    async acceptCommunityRequestTransaction(
      requestId: string,
      member: Omit<CommunityMember, 'joinedAt'>
    ): Promise<void> {
      await pg.withTransaction(async (client) => {
        // Add member to community
        const addMemberQuery = SQL`
          INSERT INTO community_members (community_id, member_address, role)
          VALUES (${member.communityId}, ${normalizeAddress(member.memberAddress)}, ${member.role})
        `
        await client.query(addMemberQuery.text, addMemberQuery.values)

        // Remove the request
        const removeRequestQuery = SQL`
          DELETE FROM community_requests WHERE id = ${requestId}
        `
        await client.query(removeRequestQuery.text, removeRequestQuery.values)
      })
    },

    async getAllCommunitiesForModeration(options: GetCommunitiesOptions): Promise<CommunityForModeration[]> {
      const { search, pagination, sortBy = 'membersCount' } = options ?? {}
      const { limit, offset } = pagination ?? {}

      let query = SQL`
        SELECT 
          c.id,
          c.name,
          c.description,
          c.owner_address as "ownerAddress",
          CASE WHEN c.private THEN 'private' ELSE 'public' END as privacy,
          c.active,
          (COALESCE(COUNT(cm.member_address), 0) + 1)::int as "membersCount",
          c.created_at as "createdAt"
        FROM communities c
        LEFT JOIN community_members cm ON c.id = cm.community_id
        WHERE c.active = true`

      if (search) {
        query = query.append(SQL` AND (c.name ILIKE ${`%${search}%`} OR c.description ILIKE ${`%${search}%`})`)
      }

      query = query.append(
        SQL` GROUP BY c.id, c.name, c.description, c.owner_address, c.private, c.active, c.created_at`
      )

      // Add sorting
      switch (sortBy) {
        case 'membersCount':
          query = query.append(SQL` ORDER BY "membersCount" DESC, c.name ASC`)
          break
        default:
          query = query.append(SQL` ORDER BY c.name ASC`)
      }

      // Add pagination
      if (limit) {
        query = query.append(SQL` LIMIT ${limit}`)
      }
      if (offset) {
        query = query.append(SQL` OFFSET ${offset}`)
      }

      const result = await pg.query<CommunityForModeration>(query)
      return result.rows
    },

    async getAllCommunitiesForModerationCount(options: Pick<GetCommunitiesOptions, 'search'>): Promise<number> {
      const { search } = options ?? {}

      const query = SQL`
        SELECT COUNT(1) as count
        FROM communities c
        WHERE c.active = true
      `

      if (search) {
        query.append(searchCommunitiesQuery(search))
      }

      return pg.getCount(query)
    }
  }
}
