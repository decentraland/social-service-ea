import { NotAuthorizedError } from '@dcl/http-commons'
import { createCommunitiesDBComponent } from '../../../src/adapters/communities-db'
import { CommunityRole, ICommunitiesDatabaseComponent } from '../../../src/types'

describe('when transferring community ownership atomically', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let advisoryLockResult: { rows: unknown[]; rowCount: number }
  let communityId: string
  let currentOwnerAddress: string
  let newOwnerAddress: string

  beforeEach(() => {
    communityId = '11111111-1111-4111-8111-111111111111'
    currentOwnerAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    newOwnerAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    advisoryLockResult = { rows: [], rowCount: 1 }
    transactionQuery = jest.fn()
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the locked owner and memberships are still valid', () => {
    beforeEach(() => {
      transactionQuery
        .mockResolvedValueOnce(advisoryLockResult)
        .mockResolvedValueOnce(advisoryLockResult)
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
    })

    it('should transfer ownership', async () => {
      await expect(
        communitiesDb.transferCommunityOwnership(communityId, currentOwnerAddress, newOwnerAddress)
      ).resolves.toBeUndefined()
    })

    it('should lock both membership rows before updating ownership', async () => {
      await communitiesDb.transferCommunityOwnership(communityId, currentOwnerAddress, newOwnerAddress)

      expect(transactionQuery.mock.calls[3][0].text).toContain('FOR UPDATE')
    })
  })

  describe('and another transfer changed the owner before locking', () => {
    beforeEach(() => {
      transactionQuery
        .mockResolvedValueOnce(advisoryLockResult)
        .mockResolvedValueOnce(advisoryLockResult)
        .mockResolvedValueOnce({
          rows: [{ owner_address: '0xcccccccccccccccccccccccccccccccccccccccc' }],
          rowCount: 1
        })
    })

    it('should reject the stale owner authorization', async () => {
      await expect(
        communitiesDb.transferCommunityOwnership(communityId, currentOwnerAddress, newOwnerAddress)
      ).rejects.toBeInstanceOf(NotAuthorizedError)
    })

    it('should stop before mutating community state', async () => {
      await communitiesDb
        .transferCommunityOwnership(communityId, currentOwnerAddress, newOwnerAddress)
        .catch(() => undefined)

      expect(transactionQuery).toHaveBeenCalledTimes(3)
    })
  })

  describe('and the target membership was removed before locking', () => {
    beforeEach(() => {
      transactionQuery
        .mockResolvedValueOnce(advisoryLockResult)
        .mockResolvedValueOnce(advisoryLockResult)
        .mockResolvedValueOnce({ rows: [{ owner_address: currentOwnerAddress }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ member_address: currentOwnerAddress, role: CommunityRole.Owner }],
          rowCount: 1
        })
    })

    it('should reject the transfer', async () => {
      await expect(
        communitiesDb.transferCommunityOwnership(communityId, currentOwnerAddress, newOwnerAddress)
      ).rejects.toThrow(`The target user ${newOwnerAddress} is not a member of community ${communityId}`)
    })

    it('should stop before mutating community state', async () => {
      await communitiesDb
        .transferCommunityOwnership(communityId, currentOwnerAddress, newOwnerAddress)
        .catch(() => undefined)

      expect(transactionQuery).toHaveBeenCalledTimes(4)
    })
  })

  describe('and a conditional role update affects no member', () => {
    beforeEach(() => {
      transactionQuery
        .mockResolvedValueOnce(advisoryLockResult)
        .mockResolvedValueOnce(advisoryLockResult)
        .mockResolvedValueOnce({ rows: [{ owner_address: currentOwnerAddress }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { member_address: currentOwnerAddress, role: CommunityRole.Owner },
            { member_address: newOwnerAddress, role: CommunityRole.Member }
          ],
          rowCount: 2
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    })

    it('should reject and roll back the transfer', async () => {
      await expect(
        communitiesDb.transferCommunityOwnership(communityId, currentOwnerAddress, newOwnerAddress)
      ).rejects.toBeInstanceOf(NotAuthorizedError)
    })
  })
})

function queryTextOf(statement: unknown): string {
  return typeof statement === 'string' ? statement : String((statement as { text?: string })?.text ?? '')
}

/** Answers by statement kind, so adding a statement does not shift every mocked result. */
function respondByStatement(ownerAddress: string, roles: Record<string, CommunityRole> = {}) {
  return async (statement: unknown) => {
    const text = queryTextOf(statement)
    if (text.includes('FROM communities')) {
      return { rows: [{ owner_address: ownerAddress }], rowCount: 1 }
    }
    if (text.includes('SELECT member_address, role FROM community_members')) {
      const rows = Object.entries(roles).map(([member_address, role]) => ({ member_address, role }))
      return { rows, rowCount: rows.length }
    }
    return { rows: [], rowCount: 1 }
  }
}

describe('when deleting a community membership atomically', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let advisoryLockResult: { rows: unknown[]; rowCount: number }
  let communityId: string
  let ownerAddress: string
  let memberAddress: string

  beforeEach(() => {
    communityId = '11111111-1111-4111-8111-111111111111'
    ownerAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    memberAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    advisoryLockResult = { rows: [], rowCount: 1 }
    transactionQuery = jest.fn()
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the target became the owner before a kick acquired its lock', () => {
    beforeEach(() => {
      transactionQuery.mockImplementation(
        respondByStatement(memberAddress, {
          [ownerAddress]: CommunityRole.Owner,
          [memberAddress]: CommunityRole.Owner
        })
      )
    })

    it('should reject removal of the new owner', async () => {
      await expect(
        communitiesDb.kickMemberFromCommunity(communityId, memberAddress, ownerAddress)
      ).rejects.toBeInstanceOf(NotAuthorizedError)
    })
  })

  describe('and the target is not the owner', () => {
    beforeEach(() => {
      transactionQuery
        .mockImplementation(
          respondByStatement(ownerAddress, {
            [ownerAddress]: CommunityRole.Owner,
            [memberAddress]: CommunityRole.Member
          })
        )
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    })

    it('should remove the member', async () => {
      await expect(
        communitiesDb.kickMemberFromCommunity(communityId, memberAddress, ownerAddress)
      ).resolves.toBeUndefined()
    })
  })

  describe('and the target became the owner before a ban acquired its lock', () => {
    beforeEach(() => {
      transactionQuery.mockImplementation(
        respondByStatement(memberAddress, {
          [ownerAddress]: CommunityRole.Owner,
          [memberAddress]: CommunityRole.Owner
        })
      )
    })

    it('should reject banning and removing the new owner', async () => {
      await expect(
        communitiesDb.banMemberAndRemoveRequests(communityId, ownerAddress, memberAddress)
      ).rejects.toBeInstanceOf(NotAuthorizedError)
    })
  })
})

describe('when changing a community member role atomically', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let transactionQuery: jest.Mock
  let withTransaction: jest.Mock
  let advisoryLockResult: { rows: unknown[]; rowCount: number }
  let communityId: string
  let ownerAddress: string
  let memberAddress: string

  beforeEach(() => {
    communityId = '11111111-1111-4111-8111-111111111111'
    ownerAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    memberAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    advisoryLockResult = { rows: [], rowCount: 1 }
    transactionQuery = jest.fn()
    withTransaction = jest.fn(async (callback) => callback({ query: transactionQuery }))
    communitiesDb = createCommunitiesDBComponent({ pg: { withTransaction } as any, logs: {} as any })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the target became the owner before the role update acquired its lock', () => {
    beforeEach(() => {
      transactionQuery.mockImplementation(
        respondByStatement(memberAddress, {
          [ownerAddress]: CommunityRole.Owner,
          [memberAddress]: CommunityRole.Owner
        })
      )
    })

    it('should reject changing the new owner role', async () => {
      await expect(
        communitiesDb.updateMemberRole(communityId, memberAddress, CommunityRole.Member, ownerAddress)
      ).rejects.toBeInstanceOf(NotAuthorizedError)
    })
  })

  describe('and the target is not the owner', () => {
    beforeEach(() => {
      transactionQuery
        .mockImplementation(
          respondByStatement(ownerAddress, {
            [ownerAddress]: CommunityRole.Owner,
            [memberAddress]: CommunityRole.Member
          })
        )
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    })

    it('should update the member role', async () => {
      await expect(
        communitiesDb.updateMemberRole(communityId, memberAddress, CommunityRole.Moderator, ownerAddress)
      ).resolves.toBeUndefined()
    })
  })
})
