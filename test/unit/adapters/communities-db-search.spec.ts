import { createCommunitiesDBComponent } from '../../../src/adapters/communities-db'
import { ICommunitiesDatabaseComponent } from '../../../src/types'

describe('when searching communities by name', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let query: jest.Mock
  let userAddress: string
  let mainQueryText: string
  let countQueryText: string

  beforeEach(async () => {
    userAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    query = jest.fn().mockResolvedValue({ rows: [{ count: 0 }], rowCount: 1 })
    communitiesDb = createCommunitiesDBComponent({ pg: { query } as any, logs: {} as any })

    await communitiesDb.searchCommunities('test', { userAddress, limit: 10, offset: 0 })
    mainQueryText = query.mock.calls[0][0].text
    countQueryText = query.mock.calls[1][0].text
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should exclude communities the caller is banned from', () => {
    expect(mainQueryText).toContain('LEFT JOIN community_bans cb')
    expect(mainQueryText).toContain('cb.banned_address IS NULL')
  })

  it('should exclude them from the total as well, so the count matches the rows', () => {
    expect(countQueryText).toContain('LEFT JOIN community_bans cb')
    expect(countQueryText).toContain('cb.banned_address IS NULL')
  })

  it('should only consider a ban that is still active', () => {
    expect(mainQueryText).toContain('cb.active = true')
  })
})
