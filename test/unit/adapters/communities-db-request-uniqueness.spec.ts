import { createCommunitiesDBComponent } from '../../../src/adapters/communities-db'
import { CommunityRequestStatus, CommunityRequestType } from '../../../src/logic/community'
import { ICommunitiesDatabaseComponent } from '../../../src/types'

const ADVISORY_LOCK_SQL = 'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))'

function queryTextOf(statement: unknown): string {
  return typeof statement === 'string' ? statement : String((statement as { text?: string })?.text ?? '')
}

describe('when creating a community request that already exists as pending', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let result: Awaited<ReturnType<ICommunitiesDatabaseComponent['createCommunityRequest']>>
  let communityId: string
  let checksummedAddress: string
  let storedAddress: string
  let queryTexts: string[]

  beforeEach(async () => {
    communityId = '11111111-1111-4111-8111-111111111111'
    checksummedAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    storedAddress = checksummedAddress.toLowerCase()
    transactionQuery = jest.fn(async (statement: unknown) => {
      const text = queryTextOf(statement)
      if (text.includes('FROM community_bans')) {
        return { rows: [], rowCount: 0 }
      }
      if (text.includes('INSERT INTO community_requests')) {
        return {
          rows: [
            {
              id: 'existing-request-id',
              community_id: communityId,
              member_address: storedAddress,
              type: CommunityRequestType.Invite,
              status: CommunityRequestStatus.Pending
            }
          ],
          rowCount: 1
        }
      }
      return { rows: [], rowCount: 1 }
    })
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })

    result = await communitiesDb.createCommunityRequest(communityId, checksummedAddress, CommunityRequestType.Invite)
    queryTexts = transactionQuery.mock.calls.map((call) => queryTextOf(call[0]))
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should take the member bucket advisory lock before touching any request row', () => {
    expect(queryTexts.findIndex((text) => text.includes(ADVISORY_LOCK_SQL))).toBe(0)
  })

  it('should recheck the active ban under that lock', () => {
    expect(queryTexts.findIndex((text) => text.includes('FROM community_bans'))).toBeGreaterThan(0)
  })

  it('should resolve the request with one insert rather than a read followed by a write', () => {
    expect(queryTexts.filter((text) => text.includes('community_requests'))).toHaveLength(1)
  })

  it('should use the pending-request uniqueness invariant as the conflict target', () => {
    expect(queryTexts.find((text) => text.includes('INSERT INTO community_requests'))).toContain(
      "ON CONFLICT (community_id, member_address, type) WHERE status = 'pending'"
    )
  })

  it('should return the row the conflict resolved to rather than the id it tried to insert', () => {
    expect(result.id).toBe('existing-request-id')
  })

  it('should return the stored address rather than the caller-supplied casing', () => {
    expect(result.memberAddress).toBe(storedAddress)
  })

  it('should report the resolved status so callers can tell it was already pending', () => {
    expect(result.status).toBe(CommunityRequestStatus.Pending)
  })
})

describe('when creating a community request for a member banned under the lock', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let thrown: Error | undefined

  beforeEach(async () => {
    transactionQuery = jest.fn(async (statement: unknown) => {
      if (queryTextOf(statement).includes('FROM community_bans')) {
        return { rows: [{ exists: 1 }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })

    thrown = await communitiesDb
      .createCommunityRequest(
        '22222222-2222-4222-8222-222222222222',
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        CommunityRequestType.RequestToJoin
      )
      .catch((error) => error)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should reject the request', () => {
    expect(thrown).toBeInstanceOf(Error)
  })

  it('should not insert a pending request for a banned member', () => {
    const inserted = transactionQuery.mock.calls.some((call) =>
      queryTextOf(call[0]).includes('INSERT INTO community_requests')
    )

    expect(inserted).toBe(false)
  })
})
