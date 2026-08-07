import { NotAuthorizedError } from '@dcl/http-commons'
import { createCommunitiesDBComponent } from '../../../src/adapters/communities-db'
import { CommunityRole, ICommunitiesDatabaseComponent } from '../../../src/types'

const ADVISORY_LOCK_SQL = 'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))'
const ROLE_LOOKUP_SQL = 'SELECT member_address, role FROM community_members'

function queryTextOf(statement: unknown): string {
  return typeof statement === 'string' ? statement : String((statement as { text?: string })?.text ?? '')
}

/**
 * Answers each statement by what it is rather than by call order, so adding a statement to a
 * transaction does not silently shift every mocked result.
 */
function respondByStatement(options: {
  ownerAddress: string
  roles: Record<string, CommunityRole>
  removedMemberRows?: number
}) {
  return async (statement: unknown) => {
    const text = queryTextOf(statement)
    if (text.includes(ROLE_LOOKUP_SQL)) {
      const rows = Object.entries(options.roles).map(([member_address, role]) => ({ member_address, role }))
      return { rows, rowCount: rows.length }
    }
    if (text.includes('FROM communities')) {
      return { rows: [{ owner_address: options.ownerAddress }], rowCount: 1 }
    }
    if (text.includes('DELETE FROM community_members')) {
      const rowCount = options.removedMemberRows ?? 1
      return { rows: new Array(rowCount).fill({ member_address: 'removed' }), rowCount }
    }
    return { rows: [], rowCount: 1 }
  }
}

describe('when banning a member and removing their requests', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let communityId: string
  let bannerAddress: string
  let targetAddress: string
  let unrelatedOwnerAddress: string
  let queryTexts: string[]

  beforeEach(() => {
    communityId = '11111111-1111-4111-8111-111111111111'
    bannerAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    targetAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    unrelatedOwnerAddress = '0xdddddddddddddddddddddddddddddddddddddddd'
    transactionQuery = jest.fn()
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the target has never been a member of the community', () => {
    let result: { wasMember: boolean }

    beforeEach(async () => {
      transactionQuery.mockImplementation(
        respondByStatement({
          ownerAddress: unrelatedOwnerAddress,
          roles: { [bannerAddress]: CommunityRole.Moderator },
          removedMemberRows: 0
        })
      )

      result = await communitiesDb.banMemberAndRemoveRequests(communityId, bannerAddress, targetAddress)
      queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
    })

    it('should record the ban', () => {
      expect(queryTexts.some((text) => text.includes('INSERT INTO community_bans'))).toBe(true)
    })

    it('should report that the target was not a member', () => {
      expect(result).toEqual({ wasMember: false })
    })
  })

  describe('and the target left the community before the ban acquired its locks', () => {
    let result: { wasMember: boolean }

    beforeEach(async () => {
      transactionQuery.mockImplementation(
        respondByStatement({
          ownerAddress: bannerAddress,
          roles: { [bannerAddress]: CommunityRole.Owner },
          removedMemberRows: 0
        })
      )

      result = await communitiesDb.banMemberAndRemoveRequests(communityId, bannerAddress, targetAddress)
      queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
    })

    it('should still record the ban so leaving does not dodge it', () => {
      expect(queryTexts.some((text) => text.includes('INSERT INTO community_bans'))).toBe(true)
    })

    it('should report that the target was not a member', () => {
      expect(result).toEqual({ wasMember: false })
    })
  })

  describe('and the actor lost the ban permission before the ban acquired its locks', () => {
    let error: Error | undefined

    beforeEach(async () => {
      transactionQuery.mockImplementation(
        respondByStatement({
          ownerAddress: unrelatedOwnerAddress,
          roles: { [bannerAddress]: CommunityRole.Member, [targetAddress]: CommunityRole.Member }
        })
      )

      error = await communitiesDb
        .banMemberAndRemoveRequests(communityId, bannerAddress, targetAddress)
        .then(() => undefined)
        .catch((thrown: Error) => thrown)
      queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
    })

    it('should reject the ban as no longer authorized', () => {
      expect(error).toBeInstanceOf(NotAuthorizedError)
    })

    it('should not record the ban', () => {
      expect(queryTexts.some((text) => text.includes('INSERT INTO community_bans'))).toBe(false)
    })
  })

  describe('and the target was promoted to moderator before the ban acquired its locks', () => {
    let error: Error | undefined

    beforeEach(async () => {
      transactionQuery.mockImplementation(
        respondByStatement({
          ownerAddress: unrelatedOwnerAddress,
          roles: { [bannerAddress]: CommunityRole.Moderator, [targetAddress]: CommunityRole.Moderator }
        })
      )

      error = await communitiesDb
        .banMemberAndRemoveRequests(communityId, bannerAddress, targetAddress)
        .then(() => undefined)
        .catch((thrown: Error) => thrown)
      queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
    })

    it('should reject the ban as no longer authorized', () => {
      expect(error).toBeInstanceOf(NotAuthorizedError)
    })

    it('should not record the ban', () => {
      expect(queryTexts.some((text) => text.includes('INSERT INTO community_bans'))).toBe(false)
    })
  })
})

describe('when updating a community member role', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let communityId: string
  let actingAddress: string
  let targetAddress: string
  let unrelatedOwnerAddress: string
  let queryTexts: string[]

  beforeEach(() => {
    communityId = '11111111-1111-4111-8111-111111111111'
    actingAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    targetAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    unrelatedOwnerAddress = '0xdddddddddddddddddddddddddddddddddddddddd'
    transactionQuery = jest.fn()
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the actor was demoted to moderator before the update acquired its locks', () => {
    let error: Error | undefined

    beforeEach(async () => {
      transactionQuery.mockImplementation(
        respondByStatement({
          ownerAddress: unrelatedOwnerAddress,
          roles: { [actingAddress]: CommunityRole.Moderator, [targetAddress]: CommunityRole.Member }
        })
      )

      error = await communitiesDb
        .updateMemberRole(communityId, targetAddress, CommunityRole.Moderator, actingAddress)
        .then(() => undefined)
        .catch((thrown: Error) => thrown)
      queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
    })

    it('should reject the role update because moderators cannot assign roles', () => {
      expect(error).toBeInstanceOf(NotAuthorizedError)
    })

    it('should not change any role', () => {
      expect(queryTexts.some((text) => text.includes('UPDATE community_members'))).toBe(false)
    })
  })

  describe('and the requested role is owner', () => {
    let error: Error | undefined

    beforeEach(async () => {
      transactionQuery.mockImplementation(
        respondByStatement({
          ownerAddress: actingAddress,
          roles: { [actingAddress]: CommunityRole.Owner, [targetAddress]: CommunityRole.Member }
        })
      )

      error = await communitiesDb
        .updateMemberRole(communityId, targetAddress, CommunityRole.Owner, actingAddress)
        .then(() => undefined)
        .catch((thrown: Error) => thrown)
      queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
    })

    it('should reject the role update because ownership is tracked on the community row', () => {
      expect(error).toBeInstanceOf(NotAuthorizedError)
    })

    it('should not change any role', () => {
      expect(queryTexts.some((text) => text.includes('UPDATE community_members'))).toBe(false)
    })
  })

  describe('and the actor is still the owner', () => {
    let error: Error | undefined

    beforeEach(async () => {
      transactionQuery.mockImplementation(
        respondByStatement({
          ownerAddress: actingAddress,
          roles: { [actingAddress]: CommunityRole.Owner, [targetAddress]: CommunityRole.Member }
        })
      )

      error = await communitiesDb
        .updateMemberRole(communityId, targetAddress, CommunityRole.Moderator, actingAddress)
        .then(() => undefined)
        .catch((thrown: Error) => thrown)
      queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
    })

    it('should apply the role update', () => {
      expect(queryTexts.some((text) => text.includes('UPDATE community_members'))).toBe(true)
    })

    it('should not reject the role update', () => {
      expect(error).toBeUndefined()
    })
  })
})

describe('when unbanning a member from a community', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let communityId: string
  let unbannerAddress: string
  let targetAddress: string
  let queryTexts: string[]

  beforeEach(() => {
    communityId = '11111111-1111-4111-8111-111111111111'
    // The actor sorts AFTER the target so argument order and lock order differ.
    unbannerAddress = '0xcccccccccccccccccccccccccccccccccccccccc'
    targetAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    transactionQuery = jest.fn()
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the actor still holds the ban permission', () => {
    let advisoryLockAddresses: string[]
    let lastAdvisoryLockIndex: number
    let banUpdateIndex: number

    beforeEach(async () => {
      transactionQuery.mockImplementation(
        respondByStatement({
          ownerAddress: unbannerAddress,
          roles: { [unbannerAddress]: CommunityRole.Moderator }
        })
      )

      await communitiesDb.unbanMemberFromCommunity(communityId, unbannerAddress, targetAddress)

      queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
      advisoryLockAddresses = transactionQuery.mock.calls
        .filter((call) => queryTextOf(call[0]).includes(ADVISORY_LOCK_SQL))
        .map((call) => call[1][1])
      lastAdvisoryLockIndex = queryTexts.reduce(
        (last, text, index) => (text.includes(ADVISORY_LOCK_SQL) ? index : last),
        -1
      )
      banUpdateIndex = queryTexts.findIndex((text) => text.includes('UPDATE community_bans'))
    })

    it('should take the same buckets the ban takes, in ascending address order', () => {
      expect(advisoryLockAddresses).toEqual([targetAddress, unbannerAddress])
    })

    it('should take every advisory lock before deactivating the ban', () => {
      expect(lastAdvisoryLockIndex).toBeLessThan(banUpdateIndex)
    })

    it('should revalidate the actor role before deactivating the ban', () => {
      expect(queryTexts.findIndex((text) => text.includes(ROLE_LOOKUP_SQL))).toBeLessThan(banUpdateIndex)
    })

    it('should deactivate the ban', () => {
      expect(banUpdateIndex).toBeGreaterThan(-1)
    })
  })

  describe('and the actor lost the ban permission before the unban acquired its locks', () => {
    let error: Error | undefined

    beforeEach(async () => {
      transactionQuery.mockImplementation(
        respondByStatement({
          ownerAddress: unbannerAddress,
          roles: { [unbannerAddress]: CommunityRole.Member }
        })
      )

      error = await communitiesDb
        .unbanMemberFromCommunity(communityId, unbannerAddress, targetAddress)
        .then(() => undefined)
        .catch((thrown: Error) => thrown)
      queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
    })

    it('should reject the unban as no longer authorized', () => {
      expect(error).toBeInstanceOf(NotAuthorizedError)
    })

    it('should not deactivate the ban', () => {
      expect(queryTexts.some((text) => text.includes('UPDATE community_bans'))).toBe(false)
    })
  })
})
