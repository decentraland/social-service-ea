import { createCommunitiesDBComponent } from '../../../src/adapters/communities-db'
import { CommunityRole, ICommunitiesDatabaseComponent } from '../../../src/types'

const ADVISORY_LOCK_SQL = 'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))'

function queryTextOf(statement: unknown): string {
  return typeof statement === 'string' ? statement : String((statement as { text?: string })?.text ?? '')
}

function isCommunitiesRowLock(text: string): boolean {
  return text.includes('FROM communities') && text.includes('FOR UPDATE')
}

describe('when banning a member and removing their requests', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let communityId: string
  let bannerAddress: string
  let bannedAddress: string
  let queryTexts: string[]
  let advisoryLockIndex: number
  let communitiesRowLockIndex: number

  beforeEach(async () => {
    communityId = '11111111-1111-4111-8111-111111111111'
    bannerAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    bannedAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ owner_address: bannerAddress }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ member_address: bannedAddress }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })

    await communitiesDb.banMemberAndRemoveRequests(communityId, bannerAddress, bannedAddress)

    queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
    advisoryLockIndex = queryTexts.findIndex((text) => text.includes(ADVISORY_LOCK_SQL))
    communitiesRowLockIndex = queryTexts.findIndex(isCommunitiesRowLock)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should take the member bucket advisory lock as the first statement of the transaction', () => {
    expect(advisoryLockIndex).toBe(0)
  })

  it('should take the member bucket advisory lock before locking the communities row', () => {
    expect(advisoryLockIndex).toBeLessThan(communitiesRowLockIndex)
  })

  it('should key the advisory lock on the community and the banned address', () => {
    expect(transactionQuery.mock.calls[0][1]).toEqual([communityId, bannedAddress])
  })
})

describe('when kicking a member from a community', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let communityId: string
  let ownerAddress: string
  let memberAddress: string
  let queryTexts: string[]
  let advisoryLockIndex: number
  let communitiesRowLockIndex: number

  beforeEach(async () => {
    communityId = '11111111-1111-4111-8111-111111111111'
    ownerAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    memberAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ owner_address: ownerAddress }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })

    await communitiesDb.kickMemberFromCommunity(communityId, memberAddress)

    queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
    advisoryLockIndex = queryTexts.findIndex((text) => text.includes(ADVISORY_LOCK_SQL))
    communitiesRowLockIndex = queryTexts.findIndex(isCommunitiesRowLock)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should take the member bucket advisory lock as the first statement of the transaction', () => {
    expect(advisoryLockIndex).toBe(0)
  })

  it('should take the member bucket advisory lock before locking the communities row', () => {
    expect(advisoryLockIndex).toBeLessThan(communitiesRowLockIndex)
  })
})

describe('when updating a community member role', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let communityId: string
  let ownerAddress: string
  let memberAddress: string
  let queryTexts: string[]
  let advisoryLockIndex: number
  let communitiesRowLockIndex: number

  beforeEach(async () => {
    communityId = '11111111-1111-4111-8111-111111111111'
    ownerAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    memberAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ owner_address: ownerAddress }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })

    await communitiesDb.updateMemberRole(communityId, memberAddress, CommunityRole.Moderator)

    queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
    advisoryLockIndex = queryTexts.findIndex((text) => text.includes(ADVISORY_LOCK_SQL))
    communitiesRowLockIndex = queryTexts.findIndex(isCommunitiesRowLock)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should take the member bucket advisory lock as the first statement of the transaction', () => {
    expect(advisoryLockIndex).toBe(0)
  })

  it('should take the member bucket advisory lock before locking the communities row', () => {
    expect(advisoryLockIndex).toBeLessThan(communitiesRowLockIndex)
  })
})

describe('when joining a member and removing their requests', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let communityId: string
  let memberAddress: string
  let queryTexts: string[]

  beforeEach(async () => {
    communityId = '11111111-1111-4111-8111-111111111111'
    memberAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'request-id' }], rowCount: 1 })
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })

    await communitiesDb.joinMemberAndRemoveRequests({
      communityId,
      memberAddress,
      role: CommunityRole.Member
    })

    queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should take the member bucket advisory lock as the first statement of the transaction', () => {
    expect(queryTexts.findIndex((text) => text.includes(ADVISORY_LOCK_SQL))).toBe(0)
  })

  it('should key the advisory lock on the community and the joining address', () => {
    expect(transactionQuery.mock.calls[0][1]).toEqual([communityId, memberAddress])
  })
})

describe('when transferring community ownership', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let communityId: string
  let currentOwnerAddress: string
  let newOwnerAddress: string

  beforeEach(() => {
    communityId = '11111111-1111-4111-8111-111111111111'
    // The current owner sorts AFTER the new owner so argument order and lock order differ.
    currentOwnerAddress = '0xcccccccccccccccccccccccccccccccccccccccc'
    newOwnerAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    transactionQuery = jest.fn()
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and both participants are distinct members', () => {
    let queryTexts: string[]
    let advisoryLockAddresses: string[]
    let lastAdvisoryLockIndex: number
    let communitiesRowLockIndex: number

    beforeEach(async () => {
      transactionQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ owner_address: currentOwnerAddress }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { member_address: currentOwnerAddress, role: CommunityRole.Owner },
            { member_address: newOwnerAddress, role: CommunityRole.Member }
          ],
          rowCount: 2
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })

      await communitiesDb.transferCommunityOwnership(communityId, currentOwnerAddress, newOwnerAddress)

      queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
      advisoryLockAddresses = transactionQuery.mock.calls
        .filter((call) => queryTextOf(call[0]).includes(ADVISORY_LOCK_SQL))
        .map((call) => call[1][1])
      lastAdvisoryLockIndex = queryTexts.reduce(
        (last, text, index) => (text.includes(ADVISORY_LOCK_SQL) ? index : last),
        -1
      )
      communitiesRowLockIndex = queryTexts.findIndex(isCommunitiesRowLock)
    })

    it('should take one advisory lock per participant', () => {
      expect(advisoryLockAddresses).toHaveLength(2)
    })

    it('should take the advisory locks in ascending address order rather than argument order', () => {
      expect(advisoryLockAddresses).toEqual([newOwnerAddress, currentOwnerAddress])
    })

    it('should take every advisory lock before locking the communities row', () => {
      expect(lastAdvisoryLockIndex).toBeLessThan(communitiesRowLockIndex)
    })

    // The membership-row lock itself is asserted in communities-db-ownership-transfer.spec.ts;
    // this file only owns the ordering between the advisory buckets and the communities row.
  })

  describe('and the current and new owner are the same address', () => {
    let advisoryLockAddresses: string[]

    beforeEach(async () => {
      transactionQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ owner_address: currentOwnerAddress }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ member_address: currentOwnerAddress, role: CommunityRole.Owner }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })

      await communitiesDb.transferCommunityOwnership(communityId, currentOwnerAddress, currentOwnerAddress)

      advisoryLockAddresses = transactionQuery.mock.calls
        .filter((call) => queryTextOf(call[0]).includes(ADVISORY_LOCK_SQL))
        .map((call) => call[1][1])
    })

    it('should take a single deduplicated advisory lock', () => {
      expect(advisoryLockAddresses).toEqual([currentOwnerAddress])
    })
  })
})

describe('when accepting every pending request to join', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let communityId: string
  let queryTexts: string[]

  beforeEach(async () => {
    communityId = '33333333-3333-4333-8333-333333333333'
    transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })

    await communitiesDb.acceptAllRequestsToJoin(communityId)

    queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should lock the communities row before reading bans, serializing this against every ban', () => {
    expect(queryTexts.findIndex((text) => text.includes('FROM communities'))).toBe(0)
  })

  it('should take the weaker row lock, which does not block a concurrent member insert', () => {
    expect(queryTexts[0]).toContain('FOR NO KEY UPDATE')
  })

  it('should not take the stronger lock that the ban and kick paths use', () => {
    expect(isCommunitiesRowLock(queryTexts[0])).toBe(false)
  })

  it('should read the ban table only after the row lock is held', () => {
    expect(queryTexts.findIndex((text) => text.includes('community_bans'))).toBeGreaterThan(0)
  })
})

describe('when accepting every pending request to join a community that is no longer active', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let accepted: string[]

  beforeEach(async () => {
    transactionQuery = jest.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 })
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })

    accepted = await communitiesDb.acceptAllRequestsToJoin('44444444-4444-4444-8444-444444444444')
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should accept nobody', () => {
    expect(accepted).toEqual([])
  })

  it('should not insert any membership', () => {
    expect(transactionQuery).toHaveBeenCalledTimes(1)
  })
})
